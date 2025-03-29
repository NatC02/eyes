import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as TWEEN from "@tweenjs/tween.js";

// Robot Eye class replacing the original EyeBall class
class RobotEye extends THREE.Mesh {
  constructor(color = 0x00ffff) {
    // Create a flat disc for the eye
    let g = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 32).rotateX(Math.PI * 0.5);
    let m = new THREE.MeshStandardMaterial({
      emissive: color,
      emissiveIntensity: 1,
      roughness: 0.2,
      metalness: 0.8,
      onBeforeCompile: shader => {
        shader.uniforms.blink = this.parent.blink;
        shader.uniforms.trackingIntensity = { value: 0.0 }; // Add tracking intensity uniform
        this.trackingIntensity = shader.uniforms.trackingIntensity;
        
        shader.vertexShader = `
          varying vec3 vPos;
          ${shader.vertexShader}
        `.replace(
          `#include <begin_vertex>`,
          `#include <begin_vertex>
            vPos = position;
          `
        );
        
        shader.fragmentShader = `
          uniform float blink;
          uniform float trackingIntensity;
          varying vec3 vPos;
          ${shader.fragmentShader}
        `.replace(
          `vec4 diffuseColor = vec4( diffuse, opacity );`,
          `vec4 diffuseColor = vec4( diffuse, opacity );
            
            // Create a circular pattern for the robot eye
            vec3 nPos = normalize(vPos);
            float dist = length(vec2(nPos.x, nPos.y)) * 2.0;
            
            // Create concentric rings
            float ring = sin(dist * 10.0) * 0.5 + 0.5;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), ring * 0.3);
            
            // Create a central pupil
            float pupil = smoothstep(0.3, 0.4, dist);
            diffuseColor.rgb = mix(vec3(0.1), diffuseColor.rgb, pupil);
            
            // Add glowing tracking indicator in the center
            float trackerSize = 0.25;
            float tracker = smoothstep(trackerSize, trackerSize - 0.05, dist);
            
            // Mix in a bright fluorescent color that gets more intense with tracking
            vec3 trackerColor = vec3(0.0, 1.0, 0.7); // Fluorescent cyan
            float glowStrength = 2.0 + trackingIntensity * 5.0; // Increases glow based on tracking
            
            // Apply the glow with intensity based on tracking
            diffuseColor.rgb = mix(diffuseColor.rgb, trackerColor * glowStrength, tracker * (0.5 + trackingIntensity * 0.5));
            
            // Handle blinking
            float blinkVal = sin(blink * PI);
            float eyeLid = smoothstep(0.9, 1.0, blinkVal);
            diffuseColor.rgb = mix(vec3(0.1, 0.1, 0.1), diffuseColor.rgb, eyeLid);
            diffuseColor.a = mix(0.0, 1.0, eyeLid);
          `
        );
      }
    });
    super(g, m);
  }
}

// Robot Eyes Group
class RobotEyes extends THREE.Group {
    constructor(camera, mouse) {
      super();
      
      this.plane = new THREE.Plane();
      this.planeNormal = new THREE.Vector3();
      this.planePoint = new THREE.Vector3();
      
      this.pointer = new THREE.Vector2();
      this.raycaster = new THREE.Raycaster();
      
      this.lookAt = new THREE.Vector3();
      this.lastLookAt = new THREE.Vector3();
      
      this.clock = new THREE.Clock();
      
      this.blink = {value: 0};
      
      // Create two eyes with different colors
      this.eyes = [
          new RobotEye(0x32CD32), // Lime green
          new RobotEye(0x32CD32)  // Lime green
        ];
      
      this.eyes.forEach((eye, idx) => {
        eye.position.x = 0.8 * (idx < 1 ? -1: 1);
        eye.position.z = 0.1;
        eye.scale.setScalar(idx < 1 ? 1 : 1);
        this.add(eye);
      });
      
      document.addEventListener("pointermove", event => {
        this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
      });
      
      this.blinking();
    }
    
    blinking() {
      let duration = 200; // Faster blink for robot
      let delay = Math.random() * 4000 + 3000;
      this.blink.value = 0;
      new TWEEN.Tween(this.blink).to({value: 1}, duration)
        .delay(delay)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onComplete(() => {this.blinking()})
        .start();
    }
    
    update() {
      this.raycaster.setFromCamera(this.pointer, this.parent.camera);
      
      this.parent.camera.getWorldDirection(this.planeNormal);
      this.planePoint.copy(this.planeNormal).setLength(5).add(this.parent.camera.position);
      this.plane.setFromNormalAndCoplanarPoint(this.planeNormal, this.planePoint);
      
      this.raycaster.ray.intersectPlane(this.plane, this.lookAt);
      
      // Make robot eyes track the mouse with limited movement
      let target = new THREE.Vector3().copy(this.lookAt);
      let maxRotation = 0.2; // Limit how far the eyes can rotate
      
      this.eyes.forEach(eye => {
        let eyeLocal = this.worldToLocal(target.clone());
        
        // Calculate how centered the mouse is to the eye's forward direction
        let eyeDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(eye.quaternion);
        let eyeToTarget = new THREE.Vector3().subVectors(eyeLocal, eye.position).normalize();
        let dotProduct = eyeDirection.dot(eyeToTarget);
        
        // Convert dot product to a 0-1 value (higher when more centered)
        let trackingPrecision = Math.pow((dotProduct + 1) / 2, 2); // Squaring makes it more dramatic
        
        // Update the tracking intensity in the shader
        if (eye.trackingIntensity) {
          eye.trackingIntensity.value = trackingPrecision;
        }
        
        // Calculate angle for eye rotation
        let angle = Math.atan2(eyeLocal.x - eye.position.x, eyeLocal.z - eye.position.z);
        angle = THREE.MathUtils.clamp(angle, -maxRotation, maxRotation);
        eye.rotation.y = angle;
      });
    }
  }

  // Robot Antenna
class Antenna extends THREE.Group {
    constructor() {
      super();
      
      // Antenna base
      const baseGeometry = new THREE.CylinderGeometry(0.1, 0.2, 0.3, 8);
      const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.4,
        metalness: 0.8
      });
      const base = new THREE.Mesh(baseGeometry, baseMaterial);
      base.position.y = 0.15;
      this.add(base);
      
      // Antenna rod
      const rodGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8);
      const rodMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.4,
        metalness: 0.8
      });
      const rod = new THREE.Mesh(rodGeometry, rodMaterial);
      rod.position.y = 0.9;
      this.add(rod);
      
      // Antenna tip light
      const tipGeometry = new THREE.SphereGeometry(0.1, 16, 16);
      const tipMaterial = new THREE.MeshStandardMaterial({
        color: 0xD8829D,
        emissive: 0xD8829D,
        emissiveIntensity: 1,
        roughness: 0.2,
        metalness: 0.5
      });
      this.tip = new THREE.Mesh(tipGeometry, tipMaterial);
      this.tip.position.y = 1.5;
      this.add(this.tip);
      
      // Start the blinking animation for the tip
      this.blinkTip();
    }
    
    blinkTip() {
      // Pulse the antenna tip
      const duration = 1000;
      const intensity = { value: 1 };
      
      new TWEEN.Tween(intensity)
        .to({ value: 0.2 }, duration)
        .easing(TWEEN.Easing.Sinusoidal.InOut)
        .onUpdate(() => {
          this.tip.material.emissiveIntensity = intensity.value;
        })
        .yoyo(true)
        .repeat(Infinity)
        .start();
    }
  }
  