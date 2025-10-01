/**
 * Camera Utilities Module
 * Handles camera enumeration, selection, and initialization for p5.js sketches
 */

class CameraManager {
  constructor() {
    this.cameras = [];
    this.selectedCameraIndex = 0;
    this.video = null;
  }

  /**
   * Find camera by name (case-insensitive partial match)
   * @param {string} cameraName - Name or partial name of the camera to find
   * @returns {number} Index of the camera, or -1 if not found
   */
  findCameraByName(cameraName) {
    return this.cameras.findIndex((camera) =>
      camera.label.toLowerCase().includes(cameraName.toLowerCase())
    );
  }

  /**
   * Enumerate all available video input devices
   * @returns {Promise<Array>} Promise that resolves with array of video input devices
   */
  async enumerateCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      throw new Error('enumerateDevices() not supported.');
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    this.cameras = devices.filter((device) => device.kind === 'videoinput');

    // Log all camera labels
    this.cameras.forEach((camera, idx) => {
      console.log(`Camera ${idx}: ${camera.label || 'Label not available'}`);
    });

    return this.cameras;
  }

  /**
   * Initialize camera by name with fallback to default
   * @param {string} preferredCameraName - Preferred camera name to search for
   * @param {number} width - Video width
   * @param {number} height - Video height
   * @returns {Promise<Object>} Promise that resolves with p5.js video object
   */
  async initializeCameraByName(preferredCameraName, width, height) {
    try {
      // Enumerate cameras first
      await this.enumerateCameras();

      if (this.cameras.length === 0) {
        throw new Error('No cameras found.');
      }

      // Find the preferred camera
      const cameraIndex = this.findCameraByName(preferredCameraName);

      if (cameraIndex !== -1) {
        console.log(
          `Found ${preferredCameraName} at index ${cameraIndex}: ${this.cameras[cameraIndex].label}`
        );
        this.selectedCameraIndex = cameraIndex;
        return await this.startVideoFromCamera(cameraIndex, width, height);
      } else {
        console.log(`${preferredCameraName} not found. Available cameras:`);
        this.cameras.forEach((camera, idx) => {
          console.log(`  ${idx}: ${camera.label}`);
        });
        console.log('Using default camera (index 0)');
        return await this.startVideoFromCamera(0, width, height);
      }
    } catch (err) {
      console.error('Error initializing camera:', err);
      throw err;
    }
  }

  /**
   * Start video capture from specific camera by index
   * @param {number} index - Index of the camera in the cameras array
   * @param {number} width - Video width
   * @param {number} height - Video height
   * @returns {Promise<Object>} Promise that resolves with p5.js video object
   */
  startVideoFromCamera(index, width, height) {
    return new Promise((resolve, reject) => {
      // Remove existing video if any
      if (this.video) {
        this.video.remove();
        this.video = null;
      }

      console.log(`Attempting to start camera at index ${index}`);
      console.log(`Device ID: ${this.cameras[index].deviceId}`);
      console.log(`Device Label: ${this.cameras[index].label}`);

      // Use p5.js createCapture with specific device constraints
      // Use 'exact' for deviceId to ensure we get the correct camera
      const constraints = {
        video: {
          deviceId: { exact: this.cameras[index].deviceId },
        },
        audio: false,
      };

      // Use p5.js createCapture with constraints
      this.video = createCapture(constraints, () => {
        console.log('Camera connected successfully');
        console.log('Active camera:', this.cameras[index].label);
        this.video.size(width, height);
        this.video.hide();
        resolve(this.video);
      });

      // Handle errors
      this.video.elt.onerror = (err) => {
        console.error('Error accessing camera:', err);
        console.error('Error type:', err.name);
        console.error('Error message:', err.message);

        // Try with fallback constraints if the specific camera fails
        console.log('Trying with fallback constraints...');
        this.tryFallbackConstraints(width, height).then(resolve).catch(reject);
      };
    });
  }

  /**
   * Fallback method using default camera
   * @param {number} width - Video width
   * @param {number} height - Video height
   * @returns {Promise<Object>} Promise that resolves with p5.js video object
   */
  tryFallbackConstraints(width, height) {
    return new Promise((resolve, reject) => {
      console.log('Attempting to use default camera with basic constraints...');

      try {
        // Use simple p5.js createCapture as fallback
        this.video = createCapture(VIDEO, () => {
          console.log(
            'Successfully connected to camera with fallback constraints'
          );
          this.video.size(width, height);
          this.video.hide();
          resolve(this.video);
        });

        // Handle errors
        this.video.elt.onerror = (err) => {
          console.error('Fallback camera access also failed:', err);
          console.error(
            'Please check camera permissions and try refreshing the page'
          );
          reject(err);
        };
      } catch (err) {
        console.error('Fallback camera access also failed:', err);
        console.error(
          'Please check camera permissions and try refreshing the page'
        );
        reject(err);
      }
    });
  }

  /**
   * Get the current video object
   * @returns {Object|null} The p5.js video object or null
   */
  getVideo() {
    return this.video;
  }

  /**
   * Get list of all cameras
   * @returns {Array} Array of camera device objects
   */
  getCameras() {
    return this.cameras;
  }

  /**
   * Get the currently selected camera index
   * @returns {number} Index of the selected camera
   */
  getSelectedCameraIndex() {
    return this.selectedCameraIndex;
  }

  /**
   * Stop and remove the current video
   */
  stopVideo() {
    if (this.video) {
      this.video.remove();
      this.video = null;
    }
  }
}
