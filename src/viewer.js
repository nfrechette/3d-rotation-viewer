import {
    AxesHelper,
    BufferAttribute,
    BufferGeometry,
    Color,
    Euler,
    Float32BufferAttribute,
    GridHelper,
    LineBasicMaterial,
    LineSegments,
    MathUtils,
    PerspectiveCamera,
    Points,
    PointsMaterial,
    Quaternion,
    Scene,
    Vector3,
    WebGLRenderer,
} from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { GUI } from 'dat.gui';
import * as d3 from "d3";

export class Viewer {

    constructor(el) {
        this.el = el;

        this.state = {
            numPoints: 4000,
            rawAxisYaw: 0.0,
            rawAxisPitch: 0.0,
            rawAngle: 0.0,
            lossyAxisYaw: 0.0,
            lossyAxisPitch: 0.0,
            lossyAngle: 0.0,
            isDirty: true,
        };

        this.rawRotation = new Quaternion();
        this.lossyRotation = new Quaternion();

        this.scene = new Scene();

        // Create our camera
        this.setupCamera();

        // Create our renderer
        this.setupRenderer();

        // Create our camera controls
        this.setupControls();

        // Add drawings for a grid and our 3 axes
        this.setupAxesAndGrid();

        // Add our GUI
        this.setupGUI();

        // TODO:
        // - add 3d scale support

        // Pull back the camera a bit
        this.camera.position.x = -6.0;
        this.camera.position.y = 3.0;
        this.camera.position.z = 2.2;
        this.controls.update();

        window.addEventListener('resize', this.resize.bind(this), false);

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    animate() {
        if (this.state.isDirty) {
            this.buildSphere();
            this.buildRotations();
            this.calculateError();
            this.updateErrorHistogram();
            this.state.isDirty = false;
        }

        this.controls.update();
        this.renderer.render(this.scene, this.camera);

        requestAnimationFrame(this.animate);
    }

    setupCamera() {
        const fov = 60;
        const aspectRatio = this.el.clientWidth / this.el.clientHeight
        const near = 0.01
        const far = 1000
        this.camera = new PerspectiveCamera(fov, aspectRatio, near, far);
        this.scene.add(this.camera);
    }

    setupRenderer() {
        this.renderer = window.renderer = new WebGLRenderer({ antialias: true });
        this.renderer.physicallyCorrectLights = true;
        this.renderer.setClearColor(0xcccccc);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.el.clientWidth, this.el.clientHeight);
        this.el.appendChild(this.renderer.domElement);
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.screenSpacePanning = true;
    }

    setupAxesAndGrid() {
        const axisLength = 50;
        const axesHelper = new AxesHelper(axisLength);
        this.scene.add(axesHelper);

        const size = 8;
        const divisions = 8;
        const gridHelper = new GridHelper(size, divisions);
        this.scene.add(gridHelper);
    }

    buildSphere() {
        if (this.sphere != null && this.sphere.geometry.getAttribute('position').array.length == this.state.numPoints * 3) {
            return;
        }

        this.sphereVertices = []
        this.sphereVertexColors = []

        const numPoints = this.state.numPoints;
        const offset = 2.0 / numPoints;
        const increment = Math.PI * (3.0 - Math.sqrt(5.0));
        for (let pointIndex = 0; pointIndex < numPoints; ++pointIndex) {
            const y = ((pointIndex * offset) - 1.0) + (offset / 2.0);
            const r = Math.sqrt(1.0 - Math.pow(y, 2.0));

            const phi = pointIndex * increment;

            const x = Math.cos(phi) * r;
            const z = Math.sin(phi) * r;

            this.sphereVertices.push(new Vector3(x, y, z));
            this.sphereVertexColors.push(new Color(0xff0000));
        }

        this.sphereVerticesArray = new Float32Array(this.sphereVertices.length * 3);
        this.sphereVerticesColorArray = new Float32Array(this.sphereVertices.length * 3);
        for (let vertexIndex = 0; vertexIndex < numPoints; ++vertexIndex) {
            const v = this.sphereVertices[vertexIndex];
            const c = this.sphereVertexColors[vertexIndex];

            this.sphereVerticesArray[(vertexIndex * 3) + 0] = v.x;
            this.sphereVerticesArray[(vertexIndex * 3) + 1] = v.y;
            this.sphereVerticesArray[(vertexIndex * 3) + 2] = v.z;

            this.sphereVerticesColorArray[(vertexIndex * 3) + 0] = c.r;
            this.sphereVerticesColorArray[(vertexIndex * 3) + 1] = c.g;
            this.sphereVerticesColorArray[(vertexIndex * 3) + 2] = c.b;
        }

        if (this.sphere != null) {
            this.scene.remove(this.sphere);
        }

        const dotGeometry = new BufferGeometry();
        dotGeometry.setAttribute('position', new BufferAttribute(this.sphereVerticesArray, 3));
        dotGeometry.setAttribute('color', new BufferAttribute(this.sphereVerticesColorArray, 3));
        const dotMaterial = new PointsMaterial({ size: 0.1, vertexColors: true });
        const dot = new Points(dotGeometry, dotMaterial);
        this.sphere = dot;
        this.scene.add(dot);
    }

    buildRotationLines() {
        if (this.rotationLines != null) {
            return;
        }

        const vertices = [
            0, 0, 0, 0, 0, 0,    // raw dir
            0, 0, 0, 0, 0, 0,    // raw roll
            0, 0, 0, 0, 0, 0,    // lossy dir
            0, 0, 0, 0, 0, 0,    // lossy roll
        ];

        const colors = [
            0, 0, 1, 0, 0, 1,    // raw dir
            0, 0, 1, 0, 0, 1,    // raw roll
            1, 0, 0, 1, 0, 0,    // lossy dir
            1, 0, 0, 1, 0, 0,    // lossy roll
        ];

        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));

        const material = new LineBasicMaterial({ vertexColors: true, toneMapped: false });
        const rotationLines = new LineSegments(geometry, material);

        this.rotationLines = rotationLines;
        this.scene.add(rotationLines);
    }

    buildRotations() {
        this.buildRotationLines();

        // Setup our raw rotation
        const rawAxisYaw = MathUtils.degToRad(this.state.rawAxisYaw);
        const rawAxisPitch = MathUtils.degToRad(this.state.rawAxisPitch);
        const rawAngle = MathUtils.degToRad(this.state.rawAngle);
        // Flip yaw's sign to be more intuitive
        const rawRotationEuler = new Euler(0.0, -rawAxisYaw, rawAxisPitch, 'XYZ');
        const rawRotationDir = new Vector3(1, 0, 0).applyEuler(rawRotationEuler).normalize();
        this.rawRotation.setFromAxisAngle(rawRotationDir, rawAngle);
        const rawAngleDir = new Vector3(0, 1, 0).applyQuaternion(this.rawRotation);

        // Setup our lossy rotation
        const lossyAxisYaw = MathUtils.degToRad(this.state.lossyAxisYaw);
        const lossyAxisPitch = MathUtils.degToRad(this.state.lossyAxisPitch);
        const lossyAngle = MathUtils.degToRad(this.state.lossyAngle);
        // Flip yaw's sign to be more intuitive
        const lossyRotationEuler = new Euler(0.0, -lossyAxisYaw, lossyAxisPitch, 'XYZ');
        const lossyRotationDir = new Vector3(1, 0, 0).applyEuler(lossyRotationEuler).normalize();
        this.lossyRotation.setFromAxisAngle(lossyRotationDir, lossyAngle);
        const lossyAngleDir = new Vector3(0, 1, 0).applyQuaternion(this.lossyRotation);

        // Update the line segments that highlights the rotations
        const axisLength = 5;
        const rollLength = 1.5;
        const rotationLinesVertices = this.rotationLines.geometry.getAttribute('position').array;
        rotationLinesVertices[3] = rawRotationDir.x * axisLength;
        rotationLinesVertices[4] = rawRotationDir.y * axisLength;
        rotationLinesVertices[5] = rawRotationDir.z * axisLength;
        rotationLinesVertices[6] = rawRotationDir.x * axisLength;
        rotationLinesVertices[7] = rawRotationDir.y * axisLength;
        rotationLinesVertices[8] = rawRotationDir.z * axisLength;
        rotationLinesVertices[9] = rawRotationDir.x * axisLength + rawAngleDir.x * rollLength;
        rotationLinesVertices[10] = rawRotationDir.y * axisLength + rawAngleDir.y * rollLength;
        rotationLinesVertices[11] = rawRotationDir.z * axisLength + rawAngleDir.z * rollLength;
        rotationLinesVertices[15] = lossyRotationDir.x * axisLength;
        rotationLinesVertices[16] = lossyRotationDir.y * axisLength;
        rotationLinesVertices[17] = lossyRotationDir.z * axisLength;
        rotationLinesVertices[18] = lossyRotationDir.x * axisLength;
        rotationLinesVertices[19] = lossyRotationDir.y * axisLength;
        rotationLinesVertices[20] = lossyRotationDir.z * axisLength;
        rotationLinesVertices[21] = lossyRotationDir.x * axisLength + lossyAngleDir.x * rollLength;
        rotationLinesVertices[22] = lossyRotationDir.y * axisLength + lossyAngleDir.y * rollLength;
        rotationLinesVertices[23] = lossyRotationDir.z * axisLength + lossyAngleDir.z * rollLength;

        this.rotationLines.geometry.setAttribute('position', new Float32BufferAttribute(rotationLinesVertices, 3));
    }

    buildErrorHistogram() {
        if (this.errorHistogramSVG != null) {
            return;
        }

        const histogramWrap = document.createElement('div');
        this.el.appendChild(histogramWrap);
        histogramWrap.id = 'histogram';
        histogramWrap.classList.add('histogram-wrap');

        const margin = { top: 10, right: 30, bottom: 30, left: 40 };
        const width = 350 - margin.left - margin.right;
        const height = 260 - margin.top - margin.bottom;

        const svg = d3.select("#histogram")
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform",
                `translate(${margin.left},${margin.top})`);

        const x = d3.scaleLinear()
            .domain([0, this.state.numPoints])
            .range([0, width]);
        this.errorHistogramX = svg.append("g")
            .attr("transform", `translate(0, ${height})`)
            .call(d3.axisBottom(x));

        const y = d3.scaleLinear()
            .range([height, 0]);
        this.errorHistogramY = svg.append("g")
            .call(d3.axisLeft(y));;

        this.errorHistogramSVG = svg;
        this.errorHistogramXScale = x;
        this.errorHistogramYScale = y;
        this.errorHistogramHeight = height;
    }

    updateErrorHistogram() {
        this.buildErrorHistogram();

        const x = this.errorHistogramXScale;
        const y = this.errorHistogramYScale;
        const height = this.errorHistogramHeight;

        // Sort our error largest first
        const data = this.errorPerVertex.sort(function(a, b) { return b - a; });

        // We pad the X axis to bound the curve on both ends
        x.domain([0, data.length + 2]);
        y.domain([0, d3.max(data)]);
        this.errorHistogramX.call(d3.axisBottom(x));
        this.errorHistogramY.call(d3.axisLeft(y));

        // Map our density curve and pad it
        const density = data.map(function(x, index) {
            return [index + 1, x];
        });
        density.unshift([0, 0.0]);
        density.push([4001, 0.0]);

        if (this.curve == null) {
            this.curve = this.errorHistogramSVG.append("path")
                .attr("class", "mypath")
                .datum(density)
                .attr("fill", "#69b3a2")
                .attr("opacity", ".8")
                .attr("stroke", "#000")
                .attr("stroke-width", 1)
                .attr("stroke-linejoin", "round")
                .attr("d", d3.line()
                    .curve(d3.curveBasis)
                    .x(function(d) { return x(d[0]); })
                    .y(function(d) { return y(d[1]); })
                );
        }

        this.curve
            .datum(density)
            .transition()
            .duration(1000)
            .attr("d", d3.line()
              .curve(d3.curveBasis)
                .x(function(d) { return x(d[0]); })
                .y(function(d) { return y(d[1]); })
            );
    }

    calculateError() {
        this.errorPerVertex = [];
        //let minError = 10000000.0;
        //let maxError = -10000000.0;
        let minError = 0.0;
        let maxError = 2.0;

        // TODO:
        //  - add error color scaling
        //  - add error plane drawing
        //  - rename histogram stuff
        //  - make y axis [0, 2.0] to avoid rescaling
        //  - add to github for history

        this.sphereVertices.forEach((v) => {
            const rawVertex = v.clone().applyQuaternion(this.rawRotation);
            const lossyVertex = v.clone().applyQuaternion(this.lossyRotation);

            // Use distance squared so scale lower/higher values more
            const error = rawVertex.distanceTo(lossyVertex);
            this.errorPerVertex.push(error);

            //minError = Math.min(minError, error);
            //maxError = Math.max(maxError, error);
        });

        const errorRange = maxError - minError;
        const normalizedErrorPerVertex = [];
        this.errorPerVertex.forEach((v) => {
            if (errorRange > 0.0) {
                const normalizedError = (v - minError) / errorRange;
                normalizedErrorPerVertex.push(normalizedError);
                //normalizedErrorPerVertex.push(v);
            } else {
                normalizedErrorPerVertex.push(v);
            }
        });
        //console.log(normalizedErrorPerVertex.sort());

        const sphereVertexColors = this.sphere.geometry.getAttribute('color').array;
        normalizedErrorPerVertex.forEach((error, vertexIndex) => {
            const hue = (1.0 - error) * 240;
            //const saturation = 100.0;
            //const lightness = 50.0;
            const color = new Color('hsl(' + hue + ', 100%, 50%)');
            sphereVertexColors[(vertexIndex * 3) + 0] = color.r;
            sphereVertexColors[(vertexIndex * 3) + 1] = color.g;
            sphereVertexColors[(vertexIndex * 3) + 2] = color.b;
        });
        this.sphere.geometry.setAttribute('color', new Float32BufferAttribute(sphereVertexColors, 3));
    }

    resize() {
        const { clientHeight, clientWidth } = this.el.parentElement;

        this.camera.aspect = clientWidth / clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(clientWidth, clientHeight);
    }

    setupGUI() {
        const gui = this.gui = new GUI({ autoPlace: false, width: 260, hideable: true });

        this.optionsFolder = gui.addFolder('Options');
        this.optionsFolder.closed = false;

        [
            this.optionsFolder.add(this.state, 'numPoints', 10, 10000, 1),

            this.optionsFolder.add(this.state, 'rawAxisYaw', -180.0, 180.0, 0.1),
            this.optionsFolder.add(this.state, 'rawAxisPitch', -180.0, 180.0, 0.1),
            this.optionsFolder.add(this.state, 'rawAngle', -180.0, 180.0, 0.1),

            this.optionsFolder.add(this.state, 'lossyAxisYaw', -180.0, 180.0, 0.1),
            this.optionsFolder.add(this.state, 'lossyAxisPitch', -180.0, 180.0, 0.1),
            this.optionsFolder.add(this.state, 'lossyAngle', -180.0, 180.0, 0.1),
        ].forEach((ctrl) => ctrl.onChange(() => this.state.isDirty = true));

        const guiWrap = document.createElement('div');
        this.el.appendChild(guiWrap);
        guiWrap.classList.add('gui-wrap');
        guiWrap.appendChild(gui.domElement);
        gui.open();
    }
};
