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
  

  // Robot Head replacing the bird Head
class RobotHead extends THREE.Group {
    constructor(camera) {
      super();
      this.camera = camera;
      
      // Create the main head cube
      const headGeometry = new THREE.BoxGeometry(2.2, 2.5, 2);
      const headMaterial = new THREE.MeshStandardMaterial({
        color: 0x777777,
        roughness: 0.4,
        metalness: 0.8,
      });
      this.headMesh = new THREE.Mesh(headGeometry, headMaterial);
      this.add(this.headMesh);
      
      // Add some details to the head - panel lines
      const addDetailPanel = (width, height, depth, x, y, z) => {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshStandardMaterial({
          color: 0x555555,
          roughness: 0.5,
          metalness: 0.9
        });
        const panel = new THREE.Mesh(geometry, material);
        panel.position.set(x, y, z);
        this.add(panel);
        return panel;
      };
      
      // Add various panels for detail
      addDetailPanel(2.3, 0.1, 1.5, 0, 0.8, 0.3);
      addDetailPanel(2.3, 0.1, 1.5, 0, -0.3, 0.3);
      addDetailPanel(1.8, 0.05, 2.1, 0, -1.0, 0);
      
      // Add a "mouth" grill
      const grillGeometry = new THREE.PlaneGeometry(1.2, 0.3);
      const grillMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.8,
        metalness: 0.6,
        side: THREE.DoubleSide
      });
      const grill = new THREE.Mesh(grillGeometry, grillMaterial);
      grill.position.set(0, -0.7, 1.01);
      this.add(grill);
      
      // Add grill lines
      for (let i = 0; i < 6; i++) {
        const lineGeometry = new THREE.PlaneGeometry(1.1, 0.02);
        const lineMaterial = new THREE.MeshBasicMaterial({
          color: 0x222222,
          side: THREE.DoubleSide
        });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        line.position.set(0, -0.7 + (i * 0.06) - 0.15, 1.02);
        this.add(line);
      }
      
      // Add robot eyes
      this.eyes = new RobotEyes();
      this.eyes.position.z = 1;
      this.eyes.position.y = 0.4;
      this.add(this.eyes);
      
      // Add an antenna on top
      this.antenna = new Antenna();
      this.antenna.position.y = 1.25;
      this.add(this.antenna);
      
      // Add ear-like structures
      const earGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.5);
      const earMaterial = new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.4,
        metalness: 0.8
      });
      
      // Left ear
      this.leftEar = new THREE.Mesh(earGeometry, earMaterial);
      this.leftEar.position.set(-1.25, 0.3, 0);
      this.add(this.leftEar);
      
      // Right ear
      this.rightEar = new THREE.Mesh(earGeometry, earMaterial);
      this.rightEar.position.set(1.25, 0.3, 0);
      this.add(this.rightEar);
      
      // Add subtle head movement
      this.headMovement();
    }
    
    headMovement() {
      // Add subtle idle movement to make the robot feel more alive
      const duration = 4000;
      const headRotation = { x: 0, y: 0 };
      
      new TWEEN.Tween(headRotation)
        .to({ 
          x: THREE.MathUtils.degToRad(2), 
          y: THREE.MathUtils.degToRad(5) 
        }, duration)
        .easing(TWEEN.Easing.Sinusoidal.InOut)
        .onUpdate(() => {
          this.rotation.x = headRotation.x;
          this.rotation.y = headRotation.y;
        })
        .yoyo(true)
        .repeat(Infinity)
        .start();
    }
    
    update() {
      this.eyes.update();
    }
  }

  // Scene setup
let scene = new THREE.Scene();
scene.background = new THREE.Color(0x111122); // Darker blue background for a tech feel

let camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 1000);
camera.position.set(2, 2, 8).setLength(8);

let renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

window.addEventListener("resize", event => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minAzimuthAngle = -Math.PI * 0.4;
controls.maxAzimuthAngle = Math.PI * 0.4;
controls.minPolarAngle = Math.PI * 0.2;
controls.maxPolarAngle = Math.PI * 0.7;

// Add lights - use more dramatic lighting for the robot
let mainLight = new THREE.DirectionalLight(0xffffff, Math.PI * 0.5);
mainLight.position.set(1, 2, 3);
scene.add(mainLight);

let blueLight = new THREE.PointLight(0x0088ff, Math.PI * 0.5);
blueLight.position.set(-3, 1, 2);
scene.add(blueLight);

let redLight = new THREE.PointLight(0xff4400, Math.PI * 0.3);
redLight.position.set(3, -1, -2);
scene.add(redLight);

// Add an additional light to make the eyes pop more
let eyeLight = new THREE.PointLight(0x00ffaa, Math.PI * 0.3);
eyeLight.position.set(0, 0, 5);
scene.add(eyeLight);

scene.add(new THREE.AmbientLight(0x222233, Math.PI * 0.2));

// Create the robot head
let robotHead = new RobotHead(camera);
scene.add(robotHead);

// Add UI indicator to show tracking is working
const addTrackingIndicator = () => {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.bottom = '20px';
    container.style.left = '20px';
    container.style.color = '#00ffaa';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.padding = '10px';
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    container.style.borderRadius = '5px';
    container.innerHTML = 'Move your mouse to see the robot eyes tracking!';
    document.body.appendChild(container);
    
    // Fade out after 5 seconds
    setTimeout(() => {
      container.style.transition = 'opacity 1s';
      container.style.opacity = '0';
      setTimeout(() => container.remove(), 1000);
    }, 5000);
  };
  
  addTrackingIndicator();
  
  // Animation loop
  let clock = new THREE.Clock();
  let t = 0;
  
  renderer.setAnimationLoop(() => {
    let dt = clock.getDelta();
    t += dt;
    
    TWEEN.update();
    controls.update();
    
    robotHead.update();
    
    renderer.render(scene, camera);
  });