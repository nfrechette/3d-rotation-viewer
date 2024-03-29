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
    Plane,
    PlaneHelper,
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
            rawAngle: 20.0,
            lossyAxisYaw: 61.4,
            lossyAxisPitch: 0.0,
            lossyAngle: 128.6,
            normalizeHeatMap: true,
            showErrorPlane: true,
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
        this.prevCameraPosition = this.camera.position.clone();
        this.controls.update();

        window.addEventListener('resize', this.resize.bind(this), false);

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    animate() {
        let shouldRender = false;

        if (this.state.isDirty) {
            this.updateSphere();
            this.updateRotations();
            this.calculateError();
            this.updateErrorHistogram();
            this.updateErrorPlane();

            this.state.isDirty = false;
            shouldRender = true;
        }
        else if (this.prevCameraPosition.distanceToSquared(this.camera.position) > 0.00001) {
            this.prevCameraPosition = this.camera.position.clone();
            shouldRender = true;
        }

        if (shouldRender) {
            this.renderer.render(this.scene, this.camera);
        }

        requestAnimationFrame(this.animate);
    }

    setupCamera() {
        const fov = 60;
        const aspectRatio = this.el.clientWidth / this.el.clientHeight;
        const near = 0.01;
        const far = 1000;
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

    updateSphere() {
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
            0, 0, 0, 0, 0, 0,    // raw dir     [0, 3]
            0, 0, 0, 0, 0, 0,    // raw roll    [6, 9]
            0, 0, 0, 0, 0, 0,    // lossy dir   [12, 15]
            0, 0, 0, 0, 0, 0,    // lossy roll  [18, 21]
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

    updateRotations() {
        this.buildRotationLines();

        // Frame of reference (right handed):
        // X+ = Red (right)
        // Y+ = Green (up)
        // Z- = Blue (forward)

        const axisLength = 5.0;
        const angleLength = 1.5;

        // Setup our raw rotation
        const rawAxisYaw = MathUtils.degToRad(this.state.rawAxisYaw);
        const rawAxisPitch = MathUtils.degToRad(this.state.rawAxisPitch);
        const rawAngle = MathUtils.degToRad(this.state.rawAngle);

        const rawRotationEuler = new Euler(rawAxisPitch, rawAxisYaw, 0.0, 'XYZ');
        const rawRotationAxis = new Vector3(0.0, 0.0, axisLength).applyEuler(rawRotationEuler);
        this.rawRotation.setFromAxisAngle(rawRotationAxis.clone().normalize(), rawAngle);
        const rawRotationAngle = new Vector3(angleLength, 0.0, 0.0)
            .applyEuler(rawRotationEuler)
            .applyQuaternion(this.rawRotation)
            .add(rawRotationAxis);

        // Setup our lossy rotation
        const lossyAxisYaw = MathUtils.degToRad(this.state.lossyAxisYaw);
        const lossyAxisPitch = MathUtils.degToRad(this.state.lossyAxisPitch);
        const lossyAngle = MathUtils.degToRad(this.state.lossyAngle);

        const lossyRotationEuler = new Euler(lossyAxisPitch, lossyAxisYaw, 0.0, 'XYZ');
        const lossyRotationAxis = new Vector3(0.0, 0.0, axisLength).applyEuler(lossyRotationEuler);
        this.lossyRotation.setFromAxisAngle(lossyRotationAxis.clone().normalize(), lossyAngle);
        const lossyRotationAngle = new Vector3(angleLength, 0.0, 0.0)
            .applyEuler(lossyRotationEuler)
            .applyQuaternion(this.lossyRotation)
            .add(lossyRotationAxis);

        // Update the line segments that highlights the rotations
        const rotationLinesVertices = this.rotationLines.geometry.attributes.position.array;
        rawRotationAxis.toArray(rotationLinesVertices, 3);
        rawRotationAxis.toArray(rotationLinesVertices, 6);
        rawRotationAngle.toArray(rotationLinesVertices, 9);
        lossyRotationAxis.toArray(rotationLinesVertices, 15);
        lossyRotationAxis.toArray(rotationLinesVertices, 18);
        lossyRotationAngle.toArray(rotationLinesVertices, 21);
        this.rotationLines.geometry.attributes.position.needsUpdate = true;
    }

    buildErrorHistogram() {
        if (this.errorHistogram != null) {
            return;
        }

        this.errorHistogram = {
            svg: null,
            curve: null,

            width: 0,
            height: 0,

            xScale: null,
            xAxis: null,
            yScale: null,
            yAxis: null,
        };

        const histogramWrap = document.createElement('div');
        this.el.appendChild(histogramWrap);
        histogramWrap.id = 'histogram';
        histogramWrap.classList.add('histogram-wrap');

        const margin = { top: 10, right: 30, bottom: 30, left: 40 };
        const width = 350 - margin.left - margin.right;
        const height = 260 - margin.top - margin.bottom;

        this.errorHistogram.width = width;
        this.errorHistogram.height = height;

        const svg = d3.select("#histogram")
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform",
                `translate(${margin.left},${margin.top})`);
        this.errorHistogram.svg = svg;

        const x = d3.scaleLinear()
            .domain([0, this.state.numPoints])
            .range([0, width]);
        this.errorHistogram.xAxis = svg.append("g")
            .attr("transform", `translate(0, ${height})`)
            .call(d3.axisBottom(x));
        this.errorHistogram.xScale = x;

        const y = d3.scaleLinear()
            .range([height, 0]);
        this.errorHistogram.yAxis = svg.append("g")
            .call(d3.axisLeft(y));
        this.errorHistogram.yScale = y;
    }

    updateErrorHistogram() {
        this.buildErrorHistogram();

        const x = this.errorHistogram.xScale;
        const y = this.errorHistogram.yScale;

        // Sort our error largest first
        const data = this.errorPerVertex.toSorted(function(a, b) { return b - a; });

        // We pad the X axis to bound the curve on both ends
        data.unshift(0.0);
        data.push(0.0);

        // Update our axes and their domain
        x.domain([0, data.length]);
        y.domain([0.0, 2.0]);
        this.errorHistogram.xAxis.call(d3.axisBottom(x));
        this.errorHistogram.yAxis.call(d3.axisLeft(y));

        // Map our density curve
        const density = data.map(function(x, index) { return [index, x]; });

        if (this.errorHistogram.curve == null) {
            this.errorHistogram.curve = this.errorHistogram.svg.append("path")
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

        this.errorHistogram.curve
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

        let minError = 10000000.0;
        let maxError = -10000000.0;

        this.sphereVertices.forEach((v) => {
            const rawVertex = v.clone().applyQuaternion(this.rawRotation);
            const lossyVertex = v.clone().applyQuaternion(this.lossyRotation);

            const error = rawVertex.distanceTo(lossyVertex);
            this.errorPerVertex.push(error);

            minError = Math.min(minError, error);
            maxError = Math.max(maxError, error);
        });

        // If we don't normalize heat map colors or if the error is contant, we use
        // the largest bounds possible: [0.0, 2.0]
        if (!this.state.normalizeHeatMap || (maxError - minError) < 0.000001) {
            minError = 0.0;
            maxError = 2.0;
        }

        const errorRange = maxError - minError;
        const normalizedErrorPerVertex = [];
        this.errorPerVertex.forEach((v) => {
            const normalizedError = MathUtils.clamp((v - minError) / errorRange, 0.0, 1.0);
            normalizedErrorPerVertex.push(normalizedError);
        });

        const sphereVertexColors = this.sphere.geometry.attributes.color.array;
        normalizedErrorPerVertex.forEach((error, vertexIndex) => {
            const hue = (1.0 - error) * 240.0;
            const saturation = 100.0;
            const lightness = 50.0;

            const color = new Color(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
            color.toArray(sphereVertexColors, vertexIndex * 3);
        });
        this.sphere.geometry.attributes.color.needsUpdate = true;
    }

    updateErrorPlane() {
        if (this.errorPlane == null) {
            this.errorPlane = new Plane();
            this.errorPlaneHelper = new PlaneHelper(this.errorPlane, 0, new Color(1.0, 1.0, 1.0).getHex());
            this.scene.add(this.errorPlaneHelper);
        }

        /*
        // Both of these are equivalent and yield the same plane
        const rawRotationAxis = new Vector3(this.rawRotation.x, this.rawRotation.y, this.rawRotation.z);
        const lossyRotationAxis = new Vector3(this.lossyRotation.x, this.lossyRotation.y, this.lossyRotation.z);

        const errorPlaneNormal = lossyRotationAxis.clone()
            .cross(rawRotationAxis.clone())
            .add(lossyRotationAxis.clone().multiplyScalar(this.rawRotation.w))
            .sub(rawRotationAxis.clone().multiplyScalar(this.lossyRotation.w));
        */
        const errorRotationDelta = this.lossyRotation.clone().conjugate().multiply(this.rawRotation);

        // Update our plane object
        const errorPlaneNormal = new Vector3(errorRotationDelta.x, errorRotationDelta.y, errorRotationDelta.z)
            .normalize();
        this.errorPlane.set(errorPlaneNormal, 0.0);
        this.errorPlaneHelper.size = this.state.showErrorPlane ? 5 : 0;
    }

    resize() {
        const aspectRatio = this.el.clientWidth / this.el.clientHeight;

        this.camera.aspect = aspectRatio;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.el.clientWidth, this.el.clientHeight);
    }

    setupGUI() {
        const gui = this.gui = new GUI({ autoPlace: false, width: 300, hideable: true });

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

            this.optionsFolder.add(this.state, 'normalizeHeatMap'),
            this.optionsFolder.add(this.state, 'showErrorPlane'),
        ].forEach((ctrl) => ctrl.onChange(() => this.state.isDirty = true));

        const guiWrap = document.createElement('div');
        this.el.appendChild(guiWrap);
        guiWrap.classList.add('gui-wrap');
        guiWrap.appendChild(gui.domElement);
        gui.open();
    }
};
