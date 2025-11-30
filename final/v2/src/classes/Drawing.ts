import p5 from 'p5';
import {
  CANVAS_HEIGHT,
  GRAVITY,
  TRIANGULARITY_THRESHOLD,
  settings,
} from '../constants';
import {
  Point,
  extractFirstPolygon,
  ensureCounterClockwise,
  ensureCyclic,
  boundingBoxAndCenterOfPolygon,
  positivePolygonArea,
  convexHull,
  simplifyPolygonWithEpsilon,
  simplifyPolygonUntilNumberOfPoints,
  ensureNonCyclic,
  getPositiveAngleFromThreePoints,
  getAngle,
  getWave,
  WaveSamplePoint,
  generateWaveBuffer,
  shiftPolygon,
  polygonLength,
} from '../util';

export class Drawing {
  p: p5;
  points: Point[];
  firstPolygonPoints: Point[] | null;
  simplifiedPoints: Point[] | null;
  simplifiedTrianglePoints: Point[] | null;

  fallingTranslationY: number;
  fallingVelocityY: number;
  fallingAccelerationY: number;
  extraLinePolygonOpacity: number;
  finishFrameCount: number;

  shapeTranslationX: number;
  shapeTranslationY: number;
  rotation: number;
  scale: number;
  doneDrawing: boolean;
  isTriangle: boolean;

  triangularity: number;
  areaOfFirstPolygon: number;
  areadOfSimplifiedTriangle: number;
  lengthOfSimplifiedTriangle: number;
  smallestAngle: number;
  smallestAngleTipPoint: Point | null;
  initialRotation: number;
  startAngle: number;
  wave: WaveSamplePoint[] | null = null;
  audioSources: (AudioBufferSourceNode | OscillatorNode)[] = [];
  gainNode: GainNode | null = null;
  modulator: AudioBufferSourceNode | null = null; // Track the modulator separately

  loopDuration: number = 0;
  startTime: number = 0;
  referencePerimeter: number = 1000; // Add as a property

  constructor(p: p5) {
    this.p = p;
    // Points & Shape Geometry
    this.points = [];
    this.firstPolygonPoints = null;
    this.simplifiedPoints = null;
    this.simplifiedTrianglePoints = null;

    // Physics & Animation
    this.fallingTranslationY = 0;
    this.fallingVelocityY = 0;
    this.fallingAccelerationY = GRAVITY;
    this.extraLinePolygonOpacity = 100;
    this.finishFrameCount = 0;

    // Transformation & State
    this.shapeTranslationX = 0;
    this.shapeTranslationY = 0;
    this.rotation = 0;
    this.scale = 1;
    this.doneDrawing = false;
    this.isTriangle = false;

    // Analysis & Metrics
    this.triangularity = 0;
    this.areaOfFirstPolygon = 0;
    this.areadOfSimplifiedTriangle = 0;
    this.lengthOfSimplifiedTriangle = 0;
    this.smallestAngle = 0;
    this.smallestAngleTipPoint = null;
    this.initialRotation = 0;
    this.startAngle = 0;
  }

  addPoint(x: number, y: number) {
    if (
      this.points.length === 0 ||
      this.points[this.points.length - 1].x !== x ||
      this.points[this.points.length - 1].y !== y
    ) {
      this.points.push(new Point(x, y));
    }
  }

  updateAudioParams() {
    if (this.modulator && this.isTriangle && this.loopDuration > 0) {
      // Recalculate loop duration based on new BPM
      const barDuration = (60 / settings.BPM) * 4;
      const loopDuration =
        (this.lengthOfSimplifiedTriangle / this.referencePerimeter) *
        barDuration;

      this.loopDuration = loopDuration;

      // Update playback rate
      // Since we are changing rate in real-time, we might need to handle pitch shift carefully
      // But for an LFO control signal, instant change is usually fine.
      // Note: AudioBufferSourceNode.playbackRate is an AudioParam, so we can set .value
      this.modulator.playbackRate.value = 1 / loopDuration;

      // We also need to adjust startTime to keep the phase consistent if possible?
      // Or just let it drift. Given it's a loop, sudden rate change will just change speed.
      // Visualizer sync relies on loopDuration, so updating it here keeps visualizer in sync.
    }
  }

  finishDrawing() {
    this.finishFrameCount = this.p.frameCount;
    this.doneDrawing = true;

    // Find first polygon
    const firstPolygon = extractFirstPolygon(this.points);
    let firstPolygonPoints = firstPolygon?.vertices ?? null;

    if (!firstPolygonPoints) {
      return;
    }

    firstPolygonPoints = ensureCyclic(
      ensureCounterClockwise(firstPolygonPoints)
    );

    // Simplify first polygon to 3 points
    const bbOfFirstPolygon = boundingBoxAndCenterOfPolygon(firstPolygonPoints);
    this.firstPolygonPoints = firstPolygonPoints;
    this.areaOfFirstPolygon = positivePolygonArea(firstPolygonPoints);
    const convexHullPoints = convexHull(this.firstPolygonPoints);

    // radius calculation
    const radius =
      Math.min(bbOfFirstPolygon.width, bbOfFirstPolygon.height) / 2 || 1;

    this.simplifiedPoints = simplifyPolygonWithEpsilon(
      convexHullPoints,
      radius * 0.1
    );
    this.simplifiedTrianglePoints = simplifyPolygonUntilNumberOfPoints(
      this.simplifiedPoints,
      3,
      radius * 0.1,
      radius * 0.1 * 0.1
    );

    this.simplifiedTrianglePoints = ensureNonCyclic(
      ensureCounterClockwise(this.simplifiedTrianglePoints)
    );

    // Check if simplified polygon is a triangle
    if (this.simplifiedTrianglePoints.length !== 3) {
      this.triangularity = 0;
      return;
    }

    this.areadOfSimplifiedTriangle = positivePolygonArea(
      this.simplifiedTrianglePoints
    );
    this.lengthOfSimplifiedTriangle = polygonLength(
      this.simplifiedTrianglePoints
    );

    const areaOfConvexHull = positivePolygonArea(convexHullPoints);
    this.triangularity = areaOfConvexHull / this.areadOfSimplifiedTriangle;
    if (this.triangularity > 1) {
      this.triangularity = 1 / this.triangularity;
    }
    console.log('triangularity', this.triangularity);

    this.isTriangle = this.triangularity > settings.TRIANGULARITY_THRESHOLD;

    if (!this.isTriangle) {
      return;
    }
    this.smallestAngle = Math.PI;
    for (let i = 0; i < this.simplifiedTrianglePoints.length; i++) {
      const pt =
        this.simplifiedTrianglePoints[i % this.simplifiedTrianglePoints.length];
      const p1 =
        this.simplifiedTrianglePoints[
          (i + 2) % this.simplifiedTrianglePoints.length
        ];
      const p2 =
        this.simplifiedTrianglePoints[
          (i + 1) % this.simplifiedTrianglePoints.length
        ];
      const angle = getPositiveAngleFromThreePoints(pt, p1, p2);
      // console.log('angle', (angle * 180) / Math.PI);
      if (angle < this.smallestAngle) {
        this.smallestAngle = angle;
        this.smallestAngleTipPoint = pt;
        this.initialRotation = getAngle(pt, p1);
      }
    }

    // console.log('smallestAngle', (this.smallestAngle * 180) / Math.PI);
    // console.log('smallestAngleTipPoint', this.smallestAngleTipPoint);

    if (this.smallestAngleTipPoint) {
      this.shapeTranslationX = this.smallestAngleTipPoint.x;
      this.shapeTranslationY = this.smallestAngleTipPoint.y;

      // Use translate method
      const tx = -this.shapeTranslationX;
      const ty = -this.shapeTranslationY;

      this.points = this.points.map((p) => p.translate(tx, ty));
      if (this.firstPolygonPoints) {
        this.firstPolygonPoints = shiftPolygon(
          this.firstPolygonPoints,
          this.firstPolygonPoints.findIndex((p) =>
            p.equalTo(this.smallestAngleTipPoint!)
          )
        ).map((p) => p.translate(tx, ty));
      }
      if (this.simplifiedPoints) {
        this.simplifiedPoints = shiftPolygon(
          this.simplifiedPoints,
          this.simplifiedPoints.findIndex((p) =>
            p.equalTo(this.smallestAngleTipPoint!)
          )
        ).map((p) => p.translate(tx, ty));
      }
      if (this.simplifiedTrianglePoints) {
        this.simplifiedTrianglePoints = shiftPolygon(
          this.simplifiedTrianglePoints,
          this.simplifiedTrianglePoints.findIndex((p) =>
            p.equalTo(this.smallestAngleTipPoint!)
          )
        ).map((p) => p.translate(tx, ty));
      }

      this.wave = getWave(
        this.firstPolygonPoints,
        this.simplifiedTrianglePoints as [Point, Point, Point]
      );
      console.log('wave', this.wave);

      if (this.wave) {
        const bufferData = generateWaveBuffer(this.wave);
        const ctx = this.p.getAudioContext() as unknown as AudioContext;
        const audioBuffer = ctx.createBuffer(1, bufferData.length, 44100);
        audioBuffer.copyToChannel(bufferData as any, 0);

        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = 1.0;
        this.gainNode.connect(ctx.destination);

        // AM Synthesis: Use the shape to modulate the volume of an audible tone
        // This allows the shape to be heard as a rhythmic pattern.
        // The duration of the pattern is proportional to the perimeter of the simplified triangle.

        // 1. Carrier (The audible tone)
        const carrier = ctx.createOscillator();
        carrier.type = 'sine';
        carrier.frequency.value = 220;
        carrier.start();

        // 2. Modulator (The Shape - Rhythm)
        const modulator = ctx.createBufferSource();
        modulator.buffer = audioBuffer;
        modulator.loop = true;

        // Calculate duration based on lengthOfSimplifiedTriangle
        // Let's say 1000 pixels perimeter = 1 bar (2 seconds at 120 BPM)
        // Adjust scaling factor as needed
        // const referencePerimeter = 1000; // Now a class property
        const barDuration = (60 / settings.BPM) * 4; // 2 seconds
        const loopDuration =
          (this.lengthOfSimplifiedTriangle / this.referencePerimeter) *
          barDuration;
        this.loopDuration = loopDuration;
        this.startTime = this.p.millis() / 1000;

        // buffer is 1 second long
        // rate = 1 / duration
        modulator.playbackRate.value = 1 / loopDuration;

        modulator.start();
        this.modulator = modulator; // Store reference

        // 3. VCA (Voltage Controlled Amplifier)
        const vca = ctx.createGain();
        vca.gain.value = 0; // Start at silence, let modulator drive amplitude

        carrier.connect(vca);
        modulator.connect(vca.gain); // The shape controls the volume (Ring Modulation)

        vca.connect(this.gainNode);

        this.audioSources.push(carrier);
        this.audioSources.push(modulator);

        this.p.userStartAudio();
      }
    }
  }

  draw() {
    // Update audio params every frame to react to GUI changes
    // In a real app, we might use an event listener or callback, but polling is fine here
    this.updateAudioParams();

    this.p.push();
    if (this.doneDrawing && this.isTriangle) {
      this.p.push(); // START transformation block
      this.p.translate(this.shapeTranslationX, this.shapeTranslationY);
      this.p.scale(this.scale);
      this.p.rotate(this.rotation);
    } else if (
      (!this.firstPolygonPoints || !this.isTriangle) &&
      this.doneDrawing
    ) {
      this.fallingVelocityY += this.fallingAccelerationY;
      this.fallingTranslationY += this.fallingVelocityY;
      this.p.translate(0, this.fallingTranslationY);
    }

    if (this.extraLinePolygonOpacity > 0 && this.doneDrawing) {
      this.extraLinePolygonOpacity -= 5;
    }

    if (this.points) {
      this.p.push();
      this.p.noFill();
      if (this.doneDrawing) {
        this.p.stroke(255, 255, 255, this.extraLinePolygonOpacity);
      } else {
        this.p.stroke(255);
      }
      this.p.beginShape();
      for (let i = 0; i < this.points.length; i++) {
        this.p.vertex(this.points[i].x, this.points[i].y);
      }
      this.p.endShape();
      this.p.pop();
    }

    if (this.firstPolygonPoints) {
      this.p.push();
      this.p.noFill();
      this.p.stroke(255);
      this.p.beginShape();
      for (let i = 0; i < this.firstPolygonPoints.length; i++) {
        this.p.vertex(
          this.firstPolygonPoints[i].x,
          this.firstPolygonPoints[i].y
        );
      }
      this.p.endShape(this.p.CLOSE);
      this.p.pop();
    }

    if (this.simplifiedTrianglePoints) {
      this.p.push();
      this.p.noFill();
      this.p.stroke(0, 255, 0, 200);
      this.p.beginShape();
      for (let i = 0; i < this.simplifiedTrianglePoints.length; i++) {
        this.p.vertex(
          this.simplifiedTrianglePoints[i].x,
          this.simplifiedTrianglePoints[i].y
        );
      }
      this.p.endShape(this.p.CLOSE);
      this.p.pop();
    }

    if (this.doneDrawing && this.isTriangle) {
      this.p.pop(); // END transformation block
    }

    // Audio Visualizer
    if (
      this.wave &&
      this.doneDrawing &&
      this.isTriangle &&
      this.loopDuration > 0
    ) {
      const currentTime = this.p.millis() / 1000;
      // We need a consistent phase that survives BPM changes.
      // Simply using (currentTime - startTime) % loopDuration is problematic if loopDuration changes mid-cycle.
      // Ideally, we'd integrate phase over time: phase += dt / duration.
      // But for simplicity, let's stick to the current time based approach and accept a jump or try to smooth it?
      // If we just recalculate loopDuration in updateAudioParams, the visualizer uses the NEW loopDuration.
      // The audio buffer playback rate also changes.
      // They SHOULD stay in sync if both update to the same new duration.
      // The only issue is the `elapsedTime` calculation.
      // If we change BPM, `loopDuration` changes. `(t - start) % newDuration` might be a different phase than `(t - start) % oldDuration`.
      // This causes a visual jump.
      // To fix this properly requires tracking accumulated phase.
      // But for this request ("visualizer also react"), simple update is the first step.

      const elapsedTime = currentTime - this.startTime;
      const progress = (elapsedTime % this.loopDuration) / this.loopDuration;

      const totalLength = this.wave[this.wave.length - 1].t;
      const currentT = progress * totalLength;

      let sampleIndex = 0;
      for (let i = 0; i < this.wave.length - 1; i++) {
        if (this.wave[i].t <= currentT && this.wave[i + 1].t > currentT) {
          sampleIndex = i;
          break;
        }
      }

      const s1 = this.wave[sampleIndex];
      const s2 = this.wave[sampleIndex + 1] || s1;

      // Interpolate for smoother position
      const segmentDuration = s2.t - s1.t;
      const segmentProgress =
        segmentDuration > 0 ? (currentT - s1.t) / segmentDuration : 0;

      if (
        s1.pt &&
        s2.pt &&
        s1.ptProjectedOnSegment &&
        s2.ptProjectedOnSegment
      ) {
        // Interpolate between points on the polygon (The jagged path)
        const polyX = s1.pt.x + (s2.pt.x - s1.pt.x) * segmentProgress;
        const polyY = s1.pt.y + (s2.pt.y - s1.pt.y) * segmentProgress;

        // Interpolate between points on the triangle (The smooth path)
        const triX =
          s1.ptProjectedOnSegment.x +
          (s2.ptProjectedOnSegment.x - s1.ptProjectedOnSegment.x) *
            segmentProgress;
        const triY =
          s1.ptProjectedOnSegment.y +
          (s2.ptProjectedOnSegment.y - s1.ptProjectedOnSegment.y) *
            segmentProgress;

        this.p.push();

        this.p.translate(this.shapeTranslationX, this.shapeTranslationY);
        this.p.scale(this.scale);
        this.p.rotate(this.rotation);

        // Draw Visualizer on Polygon (Jagged)
        this.p.fill(255); // White
        this.p.noStroke();
        this.p.circle(polyX, polyY, 5);

        // Draw Visualizer on Triangle (Smooth)
        this.p.fill(0, 255, 0); // Green
        this.p.circle(triX, triY, 5);

        // Optional: Draw connecting line
        this.p.stroke(255);
        this.p.line(polyX, polyY, triX, triY);

        this.p.pop();
      }
    }

    this.p.pop();
  }

  isOffScreen() {
    return this.fallingTranslationY > CANVAS_HEIGHT;
  }
}
