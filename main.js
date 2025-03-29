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