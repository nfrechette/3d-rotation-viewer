import {
    AxesHelper,
    BufferAttribute,
    BufferGeometry,
    Color,
    Euler,
    Float32BufferAttribute,
    GridHelper,
    Line,
    LineBasicMaterial,
    LineDashedMaterial,
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

const VIEWER_MODES = [
    //'2D Displacement',
    //'2D Error Metric',
    //'3D Displacement',    // TODO: show largest displacement for single transform
    '3D Error Metric',
];

export class Viewer {

    constructor(el) {
        this.el = el;

        this.uiState = {
            numPoints: 4000,
            showMaxErrorLocation: true,
            mode: VIEWER_MODES[0],  // 3D Error Metric
            mode2DDisp: {
                angle: 20.0,
                translationX: 0.0,
                translationY: 0.0,
                scaleX: 1.0,
                scaleY: 1.0,
            },
            mode2DMetric: {
                rawAngle: 20.0,
                rawTranslationX: 0.0,
                rawTranslationY: 0.0,
                rawScaleX: 1.0,
                rawScaleY: 1.0,
                lossyAngle: 128.6,
                lossyTranslationX: 2.0,
                lossyTranslationY: 5.0,
                lossyScaleX: 1.0,
                lossyScaleY: 1.0,
            },
            mode3DDisp: {
                axisYaw: 0.0,
                axisPitch: 0.0,
                angle: 20.0,
                translationX: 0.0,
                translationY: 0.0,
                translationZ: 0.0,
                scaleX: 1.0,
                scaleY: 1.0,
                scaleZ: 1.0,
            },
            mode3DMetric: {
                rawAxisYaw: 0.0,
                rawAxisPitch: 0.0,
                rawAngle: 20.0,
                rawTranslationX: 0.0,
                rawTranslationY: 0.0,
                rawTranslationZ: 0.0,
                rawScaleX: 1.0,
                rawScaleY: 1.0,
                rawScaleZ: 1.0,
                lossyAxisYaw: 61.4,
                lossyAxisPitch: 0.0,
                lossyAngle: 128.6,
                lossyTranslationX: 2.0,
                lossyTranslationY: 5.0,
                lossyTranslationZ: 0.0,
                lossyScaleX: 1.0,
                lossyScaleY: 1.0,
                lossyScaleZ: 1.0,
            },
            isDirty: true,
        };
        this.guiFolders = {
            mode2DDisp: {},
            mode2DMetric: {},
            mode3DDisp: {},
            mode3DMetric: {},
        };

        this.currentMode = '';

        this.transformWidgets = {};

        this.rotation = new Quaternion();
        this.translation = new Vector3();
        this.scale = new Vector3();
        this.rawRotation = new Quaternion();
        this.rawTranslation = new Vector3();
        this.rawScale = new Vector3();
        this.lossyRotation = new Quaternion();
        this.lossyTranslation = new Vector3();
        this.lossyScale = new Vector3();

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

        window.addEventListener('resize', this.resize.bind(this), false);

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    animate() {
        let shouldRender = false;

        if (this.uiState.isDirty) {
            this.updateMode();

            if (this.isMode2D()) {
                this.updateCircle();
                this.updateTransforms();
                this.calculateError();
                this.updateErrorHistogram();
            } else {
                this.updateSphere();
                this.updateTransforms();
                this.calculateError();
                this.updateErrorHistogram();
                this.updateErrorLocation();
            }

            this.uiState.isDirty = false;
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

    isMode2D() {
        switch (this.uiState.mode) {
            case '2D Displacement':
            case '2D Error Metric':
                return true;
            default:
                return false;
        }
    }

    isMode3D() {
        switch (this.uiState.mode) {
            case '3D Displacement':
            case '3D Error Metric':
                return true;
            default:
                return false;
        }
    }

    isModeDisp() {
        switch (this.uiState.mode) {
            case '2D Displacement':
            case '3D Displacement':
                return true;
            default:
                return false;
        }
    }

    isModeMetric() {
        switch (this.uiState.mode) {
            case '2D Error Metric':
            case '3D Error Metric':
                return true;
            default:
                return false;
        }
    }

    updateMode() {
        if (this.currentMode === this.uiState.mode) {
            return; // Same mode, nothing to do
        }

        // Hide and reset the UI
        this.guiFolders.mode2DDisp.transformFolder.domElement.style.display = 'none';
        this.guiFolders.mode2DMetric.rawTransformFolder.domElement.style.display = 'none';
        this.guiFolders.mode2DMetric.lossyTransformFolder.domElement.style.display = 'none';
        this.guiFolders.mode3DDisp.transformFolder.domElement.style.display = 'none';
        this.guiFolders.mode3DMetric.rawTransformFolder.domElement.style.display = 'none';
        this.guiFolders.mode3DMetric.lossyTransformFolder.domElement.style.display = 'none';

        switch (this.uiState.mode) {
            case '2D Displacement':
                this.guiFolders.mode2DDisp.transformFolder.domElement.style.display = '';
                break;
            case '2D Error Metric':
                this.guiFolders.mode2DMetric.rawTransformFolder.domElement.style.display = '';
                this.guiFolders.mode2DMetric.lossyTransformFolder.domElement.style.display = '';
                break;
            case '3D Displacement':
                this.guiFolders.mode3DDisp.transformFolder.domElement.style.display = '';
                break;
            case '3D Error Metric':
                this.guiFolders.mode3DMetric.rawTransformFolder.domElement.style.display = '';
                this.guiFolders.mode3DMetric.lossyTransformFolder.domElement.style.display = '';
                break;
        }

        // Set our new mode
        this.currentMode = this.uiState.mode;

        // Reset everything
        this.resetCamera();
        this.resetCircle();
        this.resetSphere();
        this.resetTransforms();
        this.resetErrorHistogram();
    }

    resetCamera() {
        if (this.isMode2D()) {
            // 2D camera
            this.camera.position.x = 0.0;
            this.camera.position.y = 0.0;
            this.camera.position.z = 5.0;
        } else {
            // 3D camera
            this.camera.position.x = -6.0;
            this.camera.position.y = 3.0;
            this.camera.position.z = 2.2;
        }

        this.prevCameraPosition = this.camera.position.clone();
        this.controls.update();
    }

    setupCamera() {
        const fov = 60;
        const aspectRatio = this.el.clientWidth / this.el.clientHeight;
        const near = 0.01;
        const far = 1000;
        this.camera = new PerspectiveCamera(fov, aspectRatio, near, far);
        this.scene.add(this.camera);

        this.prevCameraPosition = this.camera.position.clone();
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

    resetCircle() {
        if (this.circle != null) {
            this.scene.remove(this.circle);
            this.circle = null;
        }
    }

    updateCircle() {
        if (this.circle != null && this.circle.geometry.getAttribute('position').array.length == this.uiState.numPoints * 3) {
            return;
        }

        this.resetCircle();

        this.circleVertices = []
        this.circleVertexColors = []

        const numPoints = this.uiState.numPoints;
        const offset = 2.0 / numPoints;
        const increment = Math.PI * (3.0 - Math.sqrt(5.0));
        for (let pointIndex = 0; pointIndex < numPoints; ++pointIndex) {
            const y = ((pointIndex * offset) - 1.0) + (offset / 2.0);
            const r = Math.sqrt(1.0 - Math.pow(y, 2.0));

            const phi = pointIndex * increment;

            const x = Math.cos(phi) * r;
            const z = 0.0;

            this.circleVertices.push(new Vector3(x, y, z).normalize());
            this.circleVertexColors.push(new Color(0xff0000));
        }

        this.circleVerticesArray = new Float32Array(this.circleVertices.length * 3);
        this.circleVerticesColorArray = new Float32Array(this.circleVertices.length * 3);
        for (let vertexIndex = 0; vertexIndex < numPoints; ++vertexIndex) {
            const v = this.circleVertices[vertexIndex];
            const c = this.circleVertexColors[vertexIndex];

            this.circleVerticesArray[(vertexIndex * 3) + 0] = v.x;
            this.circleVerticesArray[(vertexIndex * 3) + 1] = v.y;
            this.circleVerticesArray[(vertexIndex * 3) + 2] = v.z;

            this.circleVerticesColorArray[(vertexIndex * 3) + 0] = c.r;
            this.circleVerticesColorArray[(vertexIndex * 3) + 1] = c.g;
            this.circleVerticesColorArray[(vertexIndex * 3) + 2] = c.b;
        }

        const dotGeometry = new BufferGeometry();
        dotGeometry.setAttribute('position', new BufferAttribute(this.circleVerticesArray, 3));
        dotGeometry.setAttribute('color', new BufferAttribute(this.circleVerticesColorArray, 3));
        const dotMaterial = new PointsMaterial({ size: 0.05, vertexColors: true });
        const circle = new Points(dotGeometry, dotMaterial);
        this.circle = circle;
        this.scene.add(circle);
    }

    resetSphere() {
        if (this.sphere != null) {
            this.scene.remove(this.sphere);
            this.sphere = null;
        }
    }

    updateSphere() {
        if (this.sphere != null && this.sphere.geometry.getAttribute('position').array.length == this.uiState.numPoints * 3) {
            return;
        }

        this.resetSphere();

        this.sphereVertices = []
        this.sphereVertexColors = []

        const numPoints = this.uiState.numPoints;
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

        const dotGeometry = new BufferGeometry();
        dotGeometry.setAttribute('position', new BufferAttribute(this.sphereVerticesArray, 3));
        dotGeometry.setAttribute('color', new BufferAttribute(this.sphereVerticesColorArray, 3));
        const dotMaterial = new PointsMaterial({ size: 0.1, vertexColors: true });
        const sphere = new Points(dotGeometry, dotMaterial);
        this.sphere = sphere;
        this.scene.add(sphere);
    }

    resetTransforms() {
        if (this.transformLines != null) {
            this.scene.remove(this.transformLines);
            this.transformLines = null;
        }

        if (this.translationLine != null) {
            this.scene.remove(this.translationLine);
            this.translationLine = null;
        }

        if (this.rawTranslationLine != null) {
            this.scene.remove(this.rawTranslationLine);
            this.rawTranslationLine = null;
        }

        if (this.lossyTranslationLine != null) {
            this.scene.remove(this.lossyTranslationLine);
            this.lossyTranslationLine = null;
        }

        this.transformWidgets = {};
    }

    updateTransforms() {
        switch (this.uiState.mode) {
            case '2D Displacement':
                this.update2DDistTransform();
                break;
            case '2D Error Metric':
                break;
            case '3D Displacement':
                break;
            case '3D Error Metric':
                this.update3DMetricTransforms();
                break;
        }
    }

    build2DDispWidgetLines() {
        if (this.transformLines != null) {
            return;
        }

        const vertices = [
            0, 0, 0, 0, 0, 0,    // dir     [0, 3]
            0, 0, 0, 0, 0, 0,    // roll    [6, 9]
        ];

        const colors = [
            0, 0, 1, 0, 0, 1,    // dir (blue)
            0, 0, 1, 0, 0, 1,    // roll (blue)
        ];

        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));

        const material = new LineBasicMaterial({ vertexColors: true, toneMapped: false });
        const transformLines = new LineSegments(geometry, material);

        this.transformLines = transformLines;
        this.scene.add(transformLines);

        const yellowColor = 0xffff00;
        const translationMaterial = new LineBasicMaterial({
            color: yellowColor
        });

        const points = [];
        points.push(new Vector3(0, 0, 0));
        points.push(new Vector3(0, 0, 0));

        const translationGeometry = new BufferGeometry().setFromPoints(points);
        const translationLine = new Line(translationGeometry, translationMaterial);
        this.translationLine = translationLine;
        this.scene.add(translationLine);

        this.transformWidgets =
        {
            translation: translationLine,
        };
    }

    update2DDistTransform() {
        this.build2DDispWidgetLines();

        // Frame of reference (right handed):
        // X+ = Red (right)
        // Y+ = Green (up)
        // Z- = Blue (forward)
        //
        // Our circle is on the XY plane, our rotation axis is thus around Z

        const axisLength = 5.0;
        const angleLength = 1.5;

        const uiState = this.uiState.mode2DDisp;

        // Setup our transform
        const angle = MathUtils.degToRad(uiState.angle);

        const rotationAxis = new Vector3(0.0, 0.0, axisLength);
        this.rotation.setFromAxisAngle(rotationAxis.clone().normalize(), angle);
        const rotationAngle = new Vector3(angleLength, 0.0, 0.0)
            .applyQuaternion(this.rotation)
            .add(rotationAxis);
        this.translation.set(uiState.translationX, uiState.translationY, 0.0);
        this.scale.set(uiState.scaleX, uiState.scaleY, 1.0);

        // Update the line segments that highlights the transform
        const transformLinesVertices = this.transformLines.geometry.attributes.position.array;
        rotationAxis.toArray(transformLinesVertices, 3);
        rotationAxis.toArray(transformLinesVertices, 6);
        rotationAngle.toArray(transformLinesVertices, 9);
        this.transformLines.geometry.attributes.position.needsUpdate = true;

        const translationLineVertices = this.transformWidgets.translation.geometry.attributes.position.array;
        this.translation.toArray(translationLineVertices, 3);
        this.transformWidgets.translation.geometry.attributes.position.needsUpdate = true;
    }

    build3DMetricWidgetLines() {
        if (this.transformLines != null) {
            return;
        }

        const vertices = [
            0, 0, 0, 0, 0, 0,    // raw dir     [0, 3]
            0, 0, 0, 0, 0, 0,    // raw roll    [6, 9]
            0, 0, 0, 0, 0, 0,    // lossy dir   [12, 15]
            0, 0, 0, 0, 0, 0,    // lossy roll  [18, 21]
        ];

        const colors = [
            0, 0, 1, 0, 0, 1,    // raw dir (blue)
            0, 0, 1, 0, 0, 1,    // raw roll (blue)
            1, 0, 0, 1, 0, 0,    // lossy dir (red)
            1, 0, 0, 1, 0, 0,    // lossy roll (red)
        ];

        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));

        const material = new LineBasicMaterial({ vertexColors: true, toneMapped: false });
        const transformLines = new LineSegments(geometry, material);

        this.transformLines = transformLines;
        this.scene.add(transformLines);

        const yellowColor = 0xffff00;
        const rawTranslationMaterial = new LineBasicMaterial({
            color: yellowColor
        });

        const points = [];
        points.push(new Vector3(0, 0, 0));
        points.push(new Vector3(0, 0, 0));

        const rawTranslationGeometry = new BufferGeometry().setFromPoints(points);
        const rawTranslationLine = new Line(rawTranslationGeometry, rawTranslationMaterial);
        this.rawTranslationLine = rawTranslationLine;
        this.scene.add(rawTranslationLine);

        const lossyTranslationMaterial = new LineDashedMaterial({
            color: yellowColor,
            linewidth: 1,
            scale: 1,
            dashSize: 0.25,
            gapSize: 0.25,
        });

        const lossyTranslationGeometry = new BufferGeometry().setFromPoints(points);
        const lossyTranslationLine = new Line(lossyTranslationGeometry, lossyTranslationMaterial);
        this.lossyTranslationLine = lossyTranslationLine;
        this.scene.add(lossyTranslationLine);

        this.transformWidgets.translation =
        {
            raw: rawTranslationLine,
            lossy: lossyTranslationLine,
        };
    }

    update3DMetricTransforms() {
        this.build3DMetricWidgetLines();

        // Frame of reference (right handed):
        // X+ = Red (right)
        // Y+ = Green (up)
        // Z- = Blue (forward)

        const axisLength = 5.0;
        const angleLength = 1.5;

        const uiState = this.uiState.mode3DMetric;

        // Setup our raw transform
        const rawAxisYaw = MathUtils.degToRad(uiState.rawAxisYaw);
        const rawAxisPitch = MathUtils.degToRad(uiState.rawAxisPitch);
        const rawAngle = MathUtils.degToRad(uiState.rawAngle);

        const rawRotationEuler = new Euler(rawAxisPitch, rawAxisYaw, 0.0, 'XYZ');
        const rawRotationAxis = new Vector3(0.0, 0.0, axisLength).applyEuler(rawRotationEuler);
        this.rawRotation.setFromAxisAngle(rawRotationAxis.clone().normalize(), rawAngle);
        const rawRotationAngle = new Vector3(angleLength, 0.0, 0.0)
            .applyEuler(rawRotationEuler)
            .applyQuaternion(this.rawRotation)
            .add(rawRotationAxis);
        this.rawTranslation.set(uiState.rawTranslationX, uiState.rawTranslationY, uiState.rawTranslationZ);
        this.rawScale.set(uiState.rawScaleX, uiState.rawScaleY, uiState.rawScaleZ);

        // Setup our lossy transform
        const lossyAxisYaw = MathUtils.degToRad(uiState.lossyAxisYaw);
        const lossyAxisPitch = MathUtils.degToRad(uiState.lossyAxisPitch);
        const lossyAngle = MathUtils.degToRad(uiState.lossyAngle);

        const lossyRotationEuler = new Euler(lossyAxisPitch, lossyAxisYaw, 0.0, 'XYZ');
        const lossyRotationAxis = new Vector3(0.0, 0.0, axisLength).applyEuler(lossyRotationEuler);
        this.lossyRotation.setFromAxisAngle(lossyRotationAxis.clone().normalize(), lossyAngle);
        const lossyRotationAngle = new Vector3(angleLength, 0.0, 0.0)
            .applyEuler(lossyRotationEuler)
            .applyQuaternion(this.lossyRotation)
            .add(lossyRotationAxis);
        this.lossyTranslation.set(uiState.lossyTranslationX, uiState.lossyTranslationY, uiState.lossyTranslationZ);
        this.lossyScale.set(uiState.lossyScaleX, uiState.lossyScaleY, uiState.lossyScaleZ);

        // Update the line segments that highlights the transform
        const transformLinesVertices = this.transformLines.geometry.attributes.position.array;
        rawRotationAxis.toArray(transformLinesVertices, 3);
        rawRotationAxis.toArray(transformLinesVertices, 6);
        rawRotationAngle.toArray(transformLinesVertices, 9);
        lossyRotationAxis.toArray(transformLinesVertices, 15);
        lossyRotationAxis.toArray(transformLinesVertices, 18);
        lossyRotationAngle.toArray(transformLinesVertices, 21);
        this.transformLines.geometry.attributes.position.needsUpdate = true;

        const rawTranslationLineVertices = this.transformWidgets.translation.raw.geometry.attributes.position.array;
        this.rawTranslation.toArray(rawTranslationLineVertices, 3);
        this.transformWidgets.translation.raw.computeLineDistances();
        this.transformWidgets.translation.raw.geometry.attributes.position.needsUpdate = true;

        const lossyTranslationLineVertices = this.transformWidgets.translation.lossy.geometry.attributes.position.array;
        this.lossyTranslation.toArray(lossyTranslationLineVertices, 3);
        this.transformWidgets.translation.lossy.computeLineDistances();
        this.transformWidgets.translation.lossy.geometry.attributes.position.needsUpdate = true;
    }

    resetErrorHistogram() {
        if (this.errorHistogram != null) {
            this.el.removeChild(this.errorHistogram.wrapDiv);
            this.errorHistogram = null;
        }
    }

    buildErrorHistogram() {
        if (this.errorHistogram != null) {
            return;
        }

        this.errorHistogram = {
            wrapDiv: null,
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
        this.errorHistogram.wrapDiv = this.el.appendChild(histogramWrap);
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
            .domain([0, this.uiState.numPoints])
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
        const maxError = Math.max(data[1], 2.0);
        x.domain([0, data.length]);
        y.domain([0.0, maxError]);
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

    computeVertexDispError(vertex) {
        // qvv_mul_point3:
        // vector_add(quat_mul_vector3(vector_mul(qvv.scale, point), qvv.rotation), qvv.translation);

        const dispVertex = vertex.clone()
            .multiply(this.scale)
            .applyQuaternion(this.rotation)
            .add(this.translation);

        return vertex.distanceTo(dispVertex);
    }

    computeVertexMetricError(vertex) {
        // qvv_mul_point3:
        // vector_add(quat_mul_vector3(vector_mul(qvv.scale, point), qvv.rotation), qvv.translation);

        const rawVertex = vertex.clone()
            .multiply(this.rawScale)
            .applyQuaternion(this.rawRotation)
            .add(this.rawTranslation);

        const lossyVertex = vertex.clone()
            .multiply(this.lossyScale)
            .applyQuaternion(this.lossyRotation)
            .add(this.lossyTranslation);

        return rawVertex.distanceTo(lossyVertex);
    }

    calculateError() {
        this.errorPerVertex = [];

        let minError = 10000000.0;
        let maxError = -10000000.0;

        const errorFun = this.isModeDisp() ? this.computeVertexDispError : this.computeVertexMetricError;
        const shapeVertices = this.isMode2D() ? this.circleVertices : this.sphereVertices;

        shapeVertices.forEach((v) => {
            const error = errorFun.call(this, v);
            this.errorPerVertex.push(error);

            minError = Math.min(minError, error);
            maxError = Math.max(maxError, error);
        });

        const shapeLabel = this.isMode2D() ? 'Circle' : 'Sphere';
        console.log(`${shapeLabel} max error: ${maxError}`);

        // If we don't have any error, we use: [0.0, 2.0]
        if ((maxError - minError) < 0.000001) {
            minError = 0.0;
            maxError = 2.0;
        }

        const errorRange = maxError - minError;
        const normalizedErrorPerVertex = [];
        this.errorPerVertex.forEach((v) => {
            const normalizedError = MathUtils.clamp((v - minError) / errorRange, 0.0, 1.0);
            normalizedErrorPerVertex.push(normalizedError);
        });

        const shape = this.isMode2D() ? this.circle : this.sphere;
        const shapeVertexColors = shape.geometry.attributes.color.array;
        normalizedErrorPerVertex.forEach((error, vertexIndex) => {
            const hue = (1.0 - error) * 240.0;
            const saturation = 100.0;
            const lightness = 50.0;

            const color = new Color(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
            color.toArray(shapeVertexColors, vertexIndex * 3);
        });
        shape.geometry.attributes.color.needsUpdate = true;
    }

    updateErrorLocation() {
        if (this.errorPlane == null) {
            const whiteColor = 0xffffff;

            this.errorPlane = new Plane();
            this.errorPlaneHelper = new PlaneHelper(this.errorPlane, 0, whiteColor);
            this.scene.add(this.errorPlaneHelper);

            const errorPointMaterial = new LineBasicMaterial({
                color: whiteColor
            });

            const points = [];
            points.push(new Vector3(0, 0, 0));
            points.push(new Vector3(0, 0, 0));

            const errorPointGeometry = new BufferGeometry().setFromPoints(points);
            const errorPointLine = new Line(errorPointGeometry, errorPointMaterial);
            this.errorPointLine = errorPointLine;
            this.scene.add(errorPointLine);
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

        /*
        Delta computation using Realtime Math:
        qvvf delta = qvv_mul(lossy, qvv_inverse(raw));

        quatf inv_raw_q = quat_conjugate(raw.q);
        vector4f inv_raw_s = vector_reciprocal(raw.s);
        vector4f inv_raw_t = quat_mul_vector3(vector_mul(raw.t, inv_raw_s), inv_raw_q);

        quatf delta_q = quat_mul(lossy.q, inv_raw_q);
        vector4f delta_t = vector_add(quat_mul_vector3(vector_mul(lossy.t, inv_raw_s), inv_raw_q), inv_raw_t);
        */

        // Compute our delta transform
        const invRawRotation = this.rawRotation.clone()
            .conjugate();
        const invRawTranslation = this.rawTranslation.clone()
            .applyQuaternion(invRawRotation)
            .negate();

        const deltaRotation = invRawRotation.clone().multiply(this.lossyRotation);

        const errorPlaneNormal = new Vector3(deltaRotation.x, deltaRotation.y, deltaRotation.z).normalize();
        const deltaRotationAngleRad = Math.acos(MathUtils.clamp(deltaRotation.w, -1.0, 1.0)) * 2.0;

        const deltaTranslation = this.lossyTranslation.clone().applyQuaternion(invRawRotation).add(invRawTranslation);

        // Half the delta rotation, negated so we can remove it
        const negHalfDeltaRotation = new Quaternion().setFromAxisAngle(errorPlaneNormal, deltaRotationAngleRad * -0.5);

        // We project the delta translation onto error plane
        // The points that rotate the most lives on it
        const deltaTranslationCrossNormal = deltaTranslation.clone()
            .cross(errorPlaneNormal)
            .normalize();

        // Our cross-point lives at the midpoint of the delta rotation
        // since the optimal delta path rotates towards the translation
        // On error plane, we remove half the delta rotation
        let errorPoint = deltaTranslationCrossNormal.clone()
            .applyQuaternion(negHalfDeltaRotation);

        // If the point ends up at zero, it means that the delta translation is colinear
        // with the delta rotation plane normal and thus all points on that plane
        // will move by the same amount. As such, we can pick any point on the plane.
        //
        // If the rotation delta is zero, then all points move by the same amount of
        // translation delta and they thus all have the same error. As such, we can pick
        // any point on the sphere.
        if (errorPoint.lengthSq() < 0.0001) {
            // Generate a random point on our sphere
            // To ensure consistent results, we pick between hardcoded perpendicular results
            let randomPoint = new Vector3(0.2, 0.0, 0.7).normalize();

            // Make sure it isn't colinear with our plane normal
            if (Math.abs(randomPoint.dot(errorPlaneNormal)) > 0.9) {
                randomPoint.set(0.0, 0.7, 0.3).normalize();
            }

            // Project it onto our plane
            // If the plane normal is zero as a result of a zero rotation delta,
            // we'll remove nothing from the random point and thus use it as-is.
            errorPoint = randomPoint.sub(errorPlaneNormal.clone()
                                            .multiplyScalar(randomPoint.dot(errorPlaneNormal)))
                            .normalize();
        }

        // Calculate the error of our desired point, it should match the max error we found
        console.log(`Computed point error: ${this.computeVertexMetricError(errorPoint)}`);

        // To compute the max error from the rotation delta, we proceed as follows:
        // We first take the quaternion dot product between the raw and lossy rotations
        // This gives us the cosine of the half rotation angle (remember that quaternions use a half angle representation)
        // We know the sphere radius (1.0 in our case) and we can create a right-angle by splitting
        // the max error contribution in two equal halves.
        // We can then use the angle cosine and the sphere radius to find the adjacent side of our triangle
        // Using the hypothenus and the adjacent side, we can compute the other side by leveraging the right-angle
        // This yields half the max rotation error
        const sphereRadius = 1.0;
        const rawLossyQuatDot = this.rawRotation.dot(this.lossyRotation);
        const rawLossyErrorTriangleAdjacent = rawLossyQuatDot * sphereRadius;
        const halfMaxDeltaRotationError =
            Math.sqrt(Math.max((sphereRadius * sphereRadius) - (rawLossyErrorTriangleAdjacent * rawLossyErrorTriangleAdjacent), 0.0))
        const maxDeltaRotationError = halfMaxDeltaRotationError * 2.0;
        //console.log(`Max delta rotation error: ${maxDeltaRotationError}`);

        // The max translation error is simply its length
        //console.log(`Max delta translation error: ${deltaTranslation.length()}`);

        // To compute the combined max error of the rotation and translation, we observe that
        // they form a triangle where one side has length equal to the max rotation error and
        // lives on the rotation delta plane. Another side has the translation delta.
        // Both of them form a triangle by forming an angle between them.
        // To avoid computing angles and using trigonometric functions, we instead build a larger
        // triangle where the hypothenus is the translation delta and one side is the projection
        // of the translation delta along the rotation plane normal. Using both sides, we can
        // compute the third using the square-root. This gives us a second portion of a larger
        // segment along the rotation plane. We add this second portion to our max rotation delta
        // error to form a larger right-angled triangle. That triangle still has the same side
        // as the first along the rotation plane normal. Again, using a square-root, we can compute
        // our third and final side we are looking for.
        const deltaTranslationAlongPlane = deltaTranslation.dot(errorPlaneNormal);
        const deltaTranslationAlongPlaneSq = deltaTranslationAlongPlane * deltaTranslationAlongPlane;
        const innerSide =
            Math.sqrt(Math.max(deltaTranslation.lengthSq() - deltaTranslationAlongPlaneSq, 0.0));
        const innerFullSide = innerSide + maxDeltaRotationError;
        const maxDeltaTransformError =
            Math.sqrt(Math.max(deltaTranslationAlongPlaneSq + (innerFullSide * innerFullSide), 0.0));

        // Edge cases:
        //   - Note that when the translation delta is zero, our distance along the normal will
        //     also be zero. This yields the translation contribution along the rotation plane
        //     to also be zero. We correctly end up taking the square-root of the squared max delta
        //     rotation error.
        //   - When the rotation delta is zero, only the translation portion will remain along
        //     the rotation plane normal (we can use any direction for the plane normal). This leaves
        //     us with a single triangle and we correctly re-compute the delta translation edge length.
        //   - When both are zero, we end up with zero as well by construction.

        console.log(`Computed max error: ${maxDeltaTransformError}`);

        //console.log(`Inv raw translation: x=${invRawTranslation.x}, y=${invRawTranslation.y}, z=${invRawTranslation.z}`);
        //console.log(`Inv lossy translation: x=${invLossyTranslation.x}, y=${invLossyTranslation.y}, z=${invLossyTranslation.z}`);
        //console.log(`Delta rotation: x=${errorPlaneNormal.x}, y=${errorPlaneNormal.y}, z=${errorPlaneNormal.z}, angle=${MathUtils.radToDeg(deltaRotationAngleRad)}`);
        //console.log(`Delta translation: x=${deltaTranslation.x}, y=${deltaTranslation.y}, z=${deltaTranslation.z}`);
        //console.log(`Error point: x=${errorPoint.x}, y=${errorPoint.y}, z=${errorPoint.z}`);

        // Update our error objects
        this.errorPlane.set(errorPlaneNormal, 0.0);
        this.errorPlaneHelper.size = this.uiState.showMaxErrorLocation ? 5 : 0;

        const errorPointLineSize = this.uiState.showMaxErrorLocation ? 2.0 : 0;
        const errorPointLineVertices = this.errorPointLine.geometry.attributes.position.array;
        errorPoint.clone().multiplyScalar(errorPointLineSize).toArray(errorPointLineVertices, 3);
        this.errorPointLine.geometry.attributes.position.needsUpdate = true;
    }

    resize() {
        const aspectRatio = this.el.clientWidth / this.el.clientHeight;

        this.camera.aspect = aspectRatio;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.el.clientWidth, this.el.clientHeight);
        this.uiState.isDirty = true;
    }

    setupGUI() {
        const gui = this.gui = new GUI({ autoPlace: false, width: 350, hideable: true });

        this.guiFolders.optionsFolder = gui.addFolder('Options');
        this.guiFolders.optionsFolder.closed = false;

        this.guiFolders.mode2DDisp.transformFolder = gui.addFolder('2D Transform');
        this.guiFolders.mode2DDisp.transformFolder.closed = false;

        this.guiFolders.mode2DMetric.rawTransformFolder = gui.addFolder('Raw 2D Transform');
        this.guiFolders.mode2DMetric.rawTransformFolder.closed = true;

        this.guiFolders.mode2DMetric.lossyTransformFolder = gui.addFolder('Lossy 2D Transform');
        this.guiFolders.mode2DMetric.lossyTransformFolder.closed = false;

        this.guiFolders.mode3DDisp.transformFolder = gui.addFolder('3D Transform');
        this.guiFolders.mode3DDisp.transformFolder.closed = false;

        this.guiFolders.mode3DMetric.rawTransformFolder = gui.addFolder('Raw 3D Transform');
        this.guiFolders.mode3DMetric.rawTransformFolder.closed = true;

        this.guiFolders.mode3DMetric.lossyTransformFolder = gui.addFolder('Lossy 3D Transform');
        this.guiFolders.mode3DMetric.lossyTransformFolder.closed = false;

        [
            this.guiFolders.optionsFolder.add(this.uiState, 'numPoints', 10, 10000, 1),
            this.guiFolders.optionsFolder.add(this.uiState, 'showMaxErrorLocation'),
            this.guiFolders.optionsFolder.add(this.uiState, 'mode', VIEWER_MODES),
        ].forEach((ctrl) => ctrl.onFinishChange(() => this.uiState.isDirty = true));

        [
            this.guiFolders.mode2DDisp.transformFolder.add(this.uiState.mode2DDisp, 'angle', -180.0, 180.0, 0.1),
            this.guiFolders.mode2DDisp.transformFolder.add(this.uiState.mode2DDisp, 'translationX', -20.0, 20.0, 0.1),
            this.guiFolders.mode2DDisp.transformFolder.add(this.uiState.mode2DDisp, 'translationY', -20.0, 20.0, 0.1),
            this.guiFolders.mode2DDisp.transformFolder.add(this.uiState.mode2DDisp, 'scaleX', -5.0, 5.0, 0.1),
            this.guiFolders.mode2DDisp.transformFolder.add(this.uiState.mode2DDisp, 'scaleY', -5.0, 5.0, 0.1),
        ].forEach((ctrl) => ctrl.onFinishChange(() => this.uiState.isDirty = true));

        [
            this.guiFolders.mode2DMetric.rawTransformFolder.add(this.uiState.mode2DMetric, 'rawAngle', -180.0, 180.0, 0.1),
            this.guiFolders.mode2DMetric.rawTransformFolder.add(this.uiState.mode2DMetric, 'rawTranslationX', -20.0, 20.0, 0.1),
            this.guiFolders.mode2DMetric.rawTransformFolder.add(this.uiState.mode2DMetric, 'rawTranslationY', -20.0, 20.0, 0.1),
            this.guiFolders.mode2DMetric.rawTransformFolder.add(this.uiState.mode2DMetric, 'rawScaleX', -5.0, 5.0, 0.1),
            this.guiFolders.mode2DMetric.rawTransformFolder.add(this.uiState.mode2DMetric, 'rawScaleY', -5.0, 5.0, 0.1),
        ].forEach((ctrl) => ctrl.onFinishChange(() => this.uiState.isDirty = true));

        [
            this.guiFolders.mode2DMetric.lossyTransformFolder.add(this.uiState.mode2DMetric, 'lossyAngle', -180.0, 180.0, 0.1),
            this.guiFolders.mode2DMetric.lossyTransformFolder.add(this.uiState.mode2DMetric, 'lossyTranslationX', -20.0, 20.0, 0.1),
            this.guiFolders.mode2DMetric.lossyTransformFolder.add(this.uiState.mode2DMetric, 'lossyTranslationY', -20.0, 20.0, 0.1),
            this.guiFolders.mode2DMetric.lossyTransformFolder.add(this.uiState.mode2DMetric, 'lossyScaleX', -5.0, 5.0, 0.1),
            this.guiFolders.mode2DMetric.lossyTransformFolder.add(this.uiState.mode2DMetric, 'lossyScaleY', -5.0, 5.0, 0.1),
        ].forEach((ctrl) => ctrl.onFinishChange(() => this.uiState.isDirty = true));

        [
            this.guiFolders.mode3DDisp.transformFolder.add(this.uiState.mode3DDisp, 'axisYaw', -180.0, 180.0, 0.1),
            this.guiFolders.mode3DDisp.transformFolder.add(this.uiState.mode3DDisp, 'axisPitch', -180.0, 180.0, 0.1),
            this.guiFolders.mode3DDisp.transformFolder.add(this.uiState.mode3DDisp, 'angle', -180.0, 180.0, 0.1),
            this.guiFolders.mode3DDisp.transformFolder.add(this.uiState.mode3DDisp, 'translationX', -20.0, 20.0, 0.1),
            this.guiFolders.mode3DDisp.transformFolder.add(this.uiState.mode3DDisp, 'translationY', -20.0, 20.0, 0.1),
            this.guiFolders.mode3DDisp.transformFolder.add(this.uiState.mode3DDisp, 'translationZ', -20.0, 20.0, 0.1),
            this.guiFolders.mode3DDisp.transformFolder.add(this.uiState.mode3DDisp, 'scaleX', -5.0, 5.0, 0.1),
            this.guiFolders.mode3DDisp.transformFolder.add(this.uiState.mode3DDisp, 'scaleY', -5.0, 5.0, 0.1),
            this.guiFolders.mode3DDisp.transformFolder.add(this.uiState.mode3DDisp, 'scaleZ', -5.0, 5.0, 0.1),
        ].forEach((ctrl) => ctrl.onFinishChange(() => this.uiState.isDirty = true));

        [
            this.guiFolders.mode3DMetric.rawTransformFolder.add(this.uiState.mode3DMetric, 'rawAxisYaw', -180.0, 180.0, 0.1),
            this.guiFolders.mode3DMetric.rawTransformFolder.add(this.uiState.mode3DMetric, 'rawAxisPitch', -180.0, 180.0, 0.1),
            this.guiFolders.mode3DMetric.rawTransformFolder.add(this.uiState.mode3DMetric, 'rawAngle', -180.0, 180.0, 0.1),
            this.guiFolders.mode3DMetric.rawTransformFolder.add(this.uiState.mode3DMetric, 'rawTranslationX', -20.0, 20.0, 0.1),
            this.guiFolders.mode3DMetric.rawTransformFolder.add(this.uiState.mode3DMetric, 'rawTranslationY', -20.0, 20.0, 0.1),
            this.guiFolders.mode3DMetric.rawTransformFolder.add(this.uiState.mode3DMetric, 'rawTranslationZ', -20.0, 20.0, 0.1),
            this.guiFolders.mode3DMetric.rawTransformFolder.add(this.uiState.mode3DMetric, 'rawScaleX', -5.0, 5.0, 0.1),
            this.guiFolders.mode3DMetric.rawTransformFolder.add(this.uiState.mode3DMetric, 'rawScaleY', -5.0, 5.0, 0.1),
            this.guiFolders.mode3DMetric.rawTransformFolder.add(this.uiState.mode3DMetric, 'rawScaleZ', -5.0, 5.0, 0.1),
        ].forEach((ctrl) => ctrl.onFinishChange(() => this.uiState.isDirty = true));

        [
            this.guiFolders.mode3DMetric.lossyTransformFolder.add(this.uiState.mode3DMetric, 'lossyAxisYaw', -180.0, 180.0, 0.1),
            this.guiFolders.mode3DMetric.lossyTransformFolder.add(this.uiState.mode3DMetric, 'lossyAxisPitch', -180.0, 180.0, 0.1),
            this.guiFolders.mode3DMetric.lossyTransformFolder.add(this.uiState.mode3DMetric, 'lossyAngle', -180.0, 180.0, 0.1),
            this.guiFolders.mode3DMetric.lossyTransformFolder.add(this.uiState.mode3DMetric, 'lossyTranslationX', -20.0, 20.0, 0.1),
            this.guiFolders.mode3DMetric.lossyTransformFolder.add(this.uiState.mode3DMetric, 'lossyTranslationY', -20.0, 20.0, 0.1),
            this.guiFolders.mode3DMetric.lossyTransformFolder.add(this.uiState.mode3DMetric, 'lossyTranslationZ', -20.0, 20.0, 0.1),
            this.guiFolders.mode3DMetric.lossyTransformFolder.add(this.uiState.mode3DMetric, 'lossyScaleX', -5.0, 5.0, 0.1),
            this.guiFolders.mode3DMetric.lossyTransformFolder.add(this.uiState.mode3DMetric, 'lossyScaleY', -5.0, 5.0, 0.1),
            this.guiFolders.mode3DMetric.lossyTransformFolder.add(this.uiState.mode3DMetric, 'lossyScaleZ', -5.0, 5.0, 0.1),
        ].forEach((ctrl) => ctrl.onFinishChange(() => this.uiState.isDirty = true));

        const guiWrap = document.createElement('div');
        this.el.appendChild(guiWrap);
        guiWrap.classList.add('gui-wrap');
        guiWrap.appendChild(gui.domElement);
        gui.open();
    }
};
