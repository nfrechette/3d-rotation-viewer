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
    '2D Displacement',
    //'2D Error Metric',
    //'3D Displacement',    // TODO: show largest displacement for single transform
    '3D Error Metric',
];

export class Viewer {

    constructor(el) {
        this.el = el;

        this.uiState = {
            numPoints: 4000,
            enableDetailedLog: true,
            showMaxErrorLocation: true,
            mode: VIEWER_MODES[0],  // 3D Error Metric
            mode2DDisp: {
                angle: 0.0,//-30.0,//20.0,
                translationX: 0.0,//1.5, //0.0,
                translationY: 0.0,//3.0, //0.0,
                scaleX: 3.0,//2.0,//1.0,
                scaleY: 0.75,//1.0,
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
            } else {
                this.updateSphere();
            }

            this.updateTransforms();
            this.calculateError();
            this.updateErrorHistogram();

            switch (this.uiState.mode) {
                case '2D Displacement':
                    this.update2DDispErrorLocation();
                    break;
                case '2D Error Metric':
                    break;
                case '3D Displacement':
                    break;
                case '3D Error Metric':
                    this.update3DMetricErrorLocation();
                    break;
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
        this.resetErrorLocation();
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
        let worstVertex = new Vector3(0.0, 0.0, 0.0);

        const errorFun = this.isModeDisp() ? this.computeVertexDispError : this.computeVertexMetricError;
        const shapeVertices = this.isMode2D() ? this.circleVertices : this.sphereVertices;

        shapeVertices.forEach((v) => {
            const error = errorFun.call(this, v);
            this.errorPerVertex.push(error);

            minError = Math.min(minError, error);

            if (error > maxError) {
                maxError = error;
                worstVertex = v;
            }
        });

        const shapeLabel = this.isMode2D() ? 'Circle' : 'Sphere';
        console.log(`${shapeLabel} max error: ${maxError}`);

        //console.log(`  -> Rotation: [${this.rotation.x}, ${this.rotation.y}, ${this.rotation.z}, ${this.rotation.w}]`);

        if (this.uiState.enableDetailedLog && this.isModeDisp()) {
            const scaled = worstVertex.clone().multiply(this.scale);
            const rotated = scaled.clone().applyQuaternion(this.rotation);
            const translated = rotated.clone().add(this.translation);

            console.log(`         Start: [${worstVertex.x}, ${worstVertex.y}, ${worstVertex.z}]`);
            console.log(`        Scaled: [${scaled.x}, ${scaled.y}, ${scaled.z}]`);
            console.log(`       Rotated: [${rotated.x}, ${rotated.y}, ${rotated.z}]`);
            console.log(`    Translated: [${translated.x}, ${translated.y}, ${translated.z}]`);

            const errorPlaneNormal = new Vector3(this.rotation.x, this.rotation.y, this.rotation.z).normalize();
            const tmp = rotated.clone().sub(scaled).normalize();
            //console.log(`       Rot Dir: [${tmp.x}, ${tmp.y}, ${tmp.z}]`);

            const dot = tmp.dot(this.translation.clone().normalize());
            //console.log(`   Rot Dir Dot: ${dot} [${MathUtils.radToDeg(Math.acos(dot))} deg]`);
        }

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

    resetErrorLocation() {
        if (this.errorPlane != null) {
            this.scene.remove(this.errorPlaneHelper);

            this.errorPlane = null;
            this.errorPlaneHelper = null;
        }

        if (this.errorPointLine != null) {
            this.scene.remove(this.errorPointLine);

            this.errorPointLine = null;
        }
    }

    /*
    Can't easily use QVV because it is lossy
    When one axis is negative, we have reflection
    When two are negative, we have a reflection induced rotation
    QVV combines this in 3x3 matrix form and extracts the resulting rotation
    which is destructive as the original rotation can no longer be recovered

    A paper proposed using a VQM approach where scale is stored as a 3x3 matrix.
    TODO: Read paper!

    What if instead we use QQVV and store the reflection induced rotation as
    a quaternion? This special rotation isn't random, it is one of 8 possible
    values since we have 8 possible reflection combinations: +++, ++-, etc
    Combining two induced rotations should yield one of the others, possibly
    cancelling out. This might form a sort of modulus calculus, possibly speeding
    up multiplication through bitwise arithmetic if we store the rotation as
    an index or bitfield. This would be much more compact than a VQM as we could
    likely store our induced rotation on 32 bits easily. Multiplying a point
    would have us perform two quaternion multiplications instead of one. We could
    easily load a constant from the induced rotation index or perhaps there is a
    clever bitwise transformation that we can perform as we mostly re-order our
    components and optionally flip their signs. If we could make it work, storage
    cost would be identical to QVV but might be slightly slower to combine/multiply.
    A worthy tradeoff for restoring associativity and removing special case code
    paths for handling negative scale, etc.

    With VQM, the M is a scale matrix and they must be combining rotation into it
    when multiplying two of them together. In reality, our scale matrix with QVV
    is a triangular matrix that we store as a vec3. And so when we multiply two QVV
    together, the resulting scale matrix is no longer triangular and we lose information
    by truncating it back. Can we avoid this and perhaps retain another quaternion?
    Go back to SQT matrix representation and see how two of them would concatenate through
    multiplication if we try and retain a diagonal scale matrix. Can we do it through
    using the inverse in between to flip the multiplication order? (q1q2)' = q2'q1'?

    Another issue we have is with the inverse: SQT' means we end up with T'Q'S'
    And so the matrix multiplication order changes. How to deal with this?
    Perhaps we could store the order in the 4th scale component since it is unused
    with float32. Alternatively, we could store rotation always with positive W and
    use the sign of W to denote the order. Armed with this information, we should be
    able to resolve left/right multiplication and other ambiguities. Perhaps we can add
    a new dimension to keep it mathy: O for order. And so, SQT would become: OSQT + O'T'Q'S'.
    Since O is either 1 or 0, one side drops out.

    When scale is uniform, the triangular matrix ends up being: scale * identity and
    so there are no longer any issues as multiplication with the identity simplifies down.

    With RTM, do we need vec4 for QVV with float64 (and other types)? Perhaps we could
    use vec3 and rely on 16-byte aligned load/stores. Is this viable? That way we wouldn't
    waste 16 bytes for padding although we might need it again to store the multiplication
    order, see above.
    */

    vectorAbs(input) {
        return new Vector3(Math.abs(input.x), Math.abs(input.y), Math.abs(input.z));
    }

    vectorMax(input0, input1) {
        return new Vector3(Math.max(input0.x, input1.x), Math.max(input0.y, input1.y), Math.max(input0.z, input1.z));
    }

    dominantAxis(input) {
        if (input.x >= input.y) {
            // x >= y
            if (input.x >= input.z) {
                // x >= y && x >= z
                return new Vector3(1.0, 0.0, 0.0);
            } else {
                // x >= y && z > x
                return new Vector3(0.0, 0.0, 1.0);
            }
        } else {
            // y > x
            if (input.y >= input.z) {
                // y > x && y >= z
                return new Vector3(0.0, 1.0, 0.0);
            } else {
                // y > x && z > y
                return new Vector3(0.0, 0.0, 1.0);
            }
        }
    }

    vectorMaxComponent(input) {
        return Math.max(Math.max(input.x, input.y), input.z);
    }

    update2DDispErrorLocation() {
        if (this.errorPointLine == null) {
            const whiteColor = 0xffffff;

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

        // TODO: add 2d scale support

        const errorPlaneNormal = new Vector3(this.rotation.x, this.rotation.y, this.rotation.z).normalize();
        const xyPlaneNormal = new Vector3(0.0, 0.0, 1.0);
        const rotationAngleSign = xyPlaneNormal.dot(errorPlaneNormal) >= 0.0 ? 1.0 : -1.0;
        const rotationAngleRad = Math.acos(MathUtils.clamp(this.rotation.w, -1.0, 1.0)) * 2.0 * rotationAngleSign;

        // Half the rotation, negated so we can remove it
        const negHalfRotation = new Quaternion().setFromAxisAngle(errorPlaneNormal, rotationAngleRad * -0.5);

        // We project the translation onto error plane
        // The points that rotate the most lives on it
        let translationCrossNormal = this.translation.clone()
            .cross(errorPlaneNormal)
            .normalize();

        // Our cross-point lives at the midpoint of the rotation
        // since the optimal path rotates towards the translation
        // On error plane, we remove half the rotation
        let errorPoint = translationCrossNormal.clone()
            .applyQuaternion(negHalfRotation);

        /////

        // Hijack computation, we rotate the translation by the inverse half rotation first
        // We then find the closest point on the circle through the cross-product
        let localTranslation = this.translation.clone()
            .applyQuaternion(negHalfRotation);

        // Apply the inverse half scale, using eerp
        // eerp = powf(start, (1.0 - alpha)) * powf(end, alpha);
        const halfScaleX = Math.pow(1.0, (1.0 - 0.5)) * Math.pow(this.scale.x, 0.5);
        const halfScaleY = Math.pow(1.0, (1.0 - 0.5)) * Math.pow(this.scale.y, 0.5);
        const halfScaleZ = Math.pow(1.0, (1.0 - 0.5)) * Math.pow(this.scale.z, 0.5);
        //const halfScale = new Vector3(halfScaleX, halfScaleY, halfScaleZ);
        const halfScale = this.scale.clone().multiplyScalar(0.5);
        const invHalfScale = new Vector3(1.0, 1.0, 1.0).divide(halfScale);
        localTranslation = localTranslation.multiply(invHalfScale);

        // What if we invert the translation by the full rotation
        // then we invert with the full scale to return to a unit circle
        // we find the point tangent the local translation direction
        // This point is not our error point, because it lies at half the rotation/scale
        // We take that point, apply half scale, and half the original rotation
        // Without scale, this would be equivalent
        // TODO test it out
        const invRotation = this.rotation.clone().conjugate();
        localTranslation = this.translation.clone()
            .applyQuaternion(invRotation);

        // MAYBE?
        const invScale = new Vector3(1.0, 1.0, 1.0).divide(this.scale);
        localTranslation = localTranslation.multiply(invScale);

        translationCrossNormal = localTranslation.clone()
            .cross(errorPlaneNormal)
            .normalize();

        // eerp(a, b, t) = a * (b / a)^t
        // eerp(a, b, 0.5) = a * sqrt(b / a)
        const scaleStart = new Vector3(1.0, 1.0, 1.0);
        const scaleEnd = this.scale.clone();
        const scaleRatio = scaleEnd.clone().divide(scaleStart);
        const scaleSqrtRatio = new Vector3(Math.sqrt(scaleRatio.x), Math.sqrt(scaleRatio.y), Math.sqrt(scaleRatio.z));
        const halfScale2 = scaleStart.clone().multiply(scaleSqrtRatio);
        translationCrossNormal = translationCrossNormal.multiply(halfScale2);

        const halfRotation = new Quaternion().setFromAxisAngle(errorPlaneNormal, rotationAngleRad * 0.5);
        translationCrossNormal = translationCrossNormal.applyQuaternion(halfRotation);

        // WHY DO WE NEED THIS? Point should be on circle!
        translationCrossNormal = translationCrossNormal.normalize();


        errorPoint = translationCrossNormal.clone();

        // Sadly, while better, this is not quite there yet
        // For rotations, the largest displacement towards the translation will be
        // when the line drawn from our start point to the fully rotated point will
        // be parallel to the translation. Half the rotation will moving towards
        // the translation, half will be moving away from it. And so the mid-point
        // has a tangent of zero. Rotation that point by neg-half gives us our desired
        // point.
        //
        // However, scales change things considerably. The circle will change over
        // time as it progressively gets scaled. And so, if we imagine that we have a
        // large scale value, it might be that the half of the rotation that goes
        // towards the translation contributes much more than the half that goes away
        // from it. There must be a point where the combined transformation contributes
        // as much in the first portion (but not half) as it does in the second portion
        // of the total displacement. For example, say our default scale is 1.0 and
        // our desired scale is 4.0. The ratio is 4x and so the mid-point of the scale
        // transformation is sqrt(4.0) = 2.0. And so, the first half will see a growth
        // from 1.0 to 2.0, while the second half will see 2.0 to 4.0. The ratio on both
        // ends is the same, a growth of 2x.
        //
        // And so we are looking for 't' in:
        // slerp(identity, rotation, t) + eerp(identity, scale, t) ????
        //
        // Our starting point is on the unit circle while our end point is on the fully
        // deformed circle. If we have negative scaling, it might be that our start and
        // end points end up at the same place for some points yielding a displacement of
        // zero. It might help to draw both circles as overlapping allowing us to draw
        // the displacement arc to scale. Perhaps there is a third circle where both the
        // start/end points lie where we can infer the half rotation from on that third
        // circle. NEED GRID PAPER

        const halfScale3 = scaleSqrtRatio;
        const unscaledTranslation = this.translation.clone().divide(this.scale);
        const halfTranslation = unscaledTranslation.clone()
            .add(this.translation.clone().sub(unscaledTranslation).multiplyScalar(0.5));

        translationCrossNormal = this.translation.clone()
        //translationCrossNormal = halfTranslation.clone()
        //translationCrossNormal = unscaledTranslation.clone()
            //.add(this.translation)
            //.multiplyScalar(0.5)
            //.divide(this.scale)
            // TODO: multiply by half scale (sqrt) to match half rotation
            //.multiply(halfScale3)
            //.divide(halfScale3)
            .cross(errorPlaneNormal)
            .normalize()
            //.multiply(halfScale2)
            //.multiply(this.scale);

        // We need to scale the translationCrossNormal so that it lies on our scaled circle
        // However, we don't know the radius of our rotation circle that intersects our scale
        // circle at our intermediate point and final point.
        // To find it, we compute a line from our circle center and half neg rotated translation
        // cross normal. We then intersect that line with the scaled circle and solve using the
        // quadratic formula. Because we work on the rotation plane, even in 3D we solve for a circle.
        // Where we intersect the scaled circle gives us our rotation radius and we can apply
        // the inverse scale to that point to find our source error point.

        // The point on the scaled circle that moves the most towards the translation might not
        // be one that moves much. Other points might move in the general direction of the
        // translation and end up contributing more if their angle with the translation is small
        // enough. Without scaling, this angle is always zero and the two align, but not so when
        // non-uniform scale is present.
        // Find the scaled point that moves the most with rotation, can we use that distance
        // to form a triangle with the translation? We know the result will be equal or smaller
        // to that rotated distance.
        // The error point on the scaled circle might not even rotate towards the translation!
        // There are always 4 points on a circle that move by the same distance under rotation:
        // [+-x, +-y]. Two will rotate towards the translation, two rotate away from it. They all
        // live on the same greater circle with radius R. Once translated, two points will move
        // towards the center of the original unit circle, two will move away from it. The point
        // that moves furthest away from the unit circle is thus one of the first two.
        // The point that moves the most does so relative to the unit circle.

        errorPoint = translationCrossNormal.clone()
            .applyQuaternion(negHalfRotation)
            .normalize()
            //.divide(this.scale);

        const errorPointSq = errorPoint.clone().multiply(errorPoint);
        const scaleSq = this.scale.clone().multiply(this.scale);
        let radius2 = Math.sqrt(1.0 / ((errorPointSq.x / scaleSq.x) + (errorPointSq.y / scaleSq.y)));

        const errorPointDivScale = errorPoint.clone().divide(this.scale);
        const errorPointDivScaleSq = errorPointDivScale.clone().multiply(errorPointDivScale);
        radius2 = Math.sqrt(1.0 / (errorPointDivScaleSq.x + errorPointDivScaleSq.y));

        errorPoint = errorPoint.multiplyScalar(radius2);

        let test = errorPoint.clone().divide(this.scale);
        let test2 = test.clone().multiply(test);
        //console.log(`Radius: ${radius2} -> [${test2.x + test2.y} == 1]`);

        errorPoint = errorPoint.clone().divide(this.scale);

        // Back to the basics
        {
            // When we have just scale, the point that moves the most, Pmax, is the one that lives
            // along the largest scale axis. Consider what happens to a point P1 right next to it.
            // P1 forms a triangle with Pmax and the origin. From P1, we can make a right angle
            // triangle by drawing a line from it towards the origin-Pmax segment. By construction,
            // the hypothenus of the larger triangle formed (with the origin) must be smaller than
            // the origin-Pmax segment since we cut it in two. The point opposite Pmax along the
            // dominant axis also moves equally.
            const absScale = this.vectorAbs(this.scale);
            const maxScaleAxis = this.dominantAxis(absScale);

            // When we add rotation to the mix, the points that move the most are still the same:
            // at both ends of the dominant axis. All other points move less further away from the
            // origin and as such form a smaller radius with which we rotate with. The furthest
            // points have the largest rotation radius.
            // Empirically, that's not true, why is that?
            // After scaling and rotation, the distance traveled is represented by a triangle with:
            // Pa -> Pb (after scaling)
            // Pb -> Pc (after rotation)
            // Pc -> Pa (our total displacement)
            // This triangle can be split into two right-angled triangles by drawling a line from
            // Pc down to the segment formed by Pa -> Pb, we intercept the segment at Pd
            // The triangles are: [Pa, Pd, Pc] and [Pd, Pb, Pc]

            errorPoint = maxScaleAxis.clone();
        }

        // Quat operations:
        // Multiplication: R1 * R2 =
        //    (R2w * R1x) + (R2x * R1w) + (R2y * R1z) - (R2z * R1y)
        //    (R2w * R1y) - (R2x * R1z) + (R2y * R1w) + (R2z * R1x)
        //    (R2w * R1z) + (R2x * R1y) - (R2y * R1x) + (R2z * R1w)
        //    (R2w * R1w) - (R2x * R1x) - (R2y * R1y) - (R2z * R1z)
        // Point multiplication: p * R = R' * [p, 0] * R
        // Conjugate: R' = [-Rx, -Ry, -Rz, Rw]

        // Let's do long form using algebra
        // We want to find the maximum of the following function:
        // f = |p * T - p|^2
        // f = |p * (S * R) - p|^2
        // Where:
        //    p: the point we are searching for that maximizes f
        //    T: the transform
        //    S: the transform scale
        //    R: the transform rotation
        //
        // Let us define:
        //    p = [x, y, z]
        //    S = [Sx, Sy, Sz]
        //    R = [Rx, Ry, Rz, Rw] (as a quaternion)
        //
        // Expanding:
        //    p * S = [Sx * x, Sy * y, Sz * z]
        //    (p * S) * R -> transforming to quaternion operation -> R' * [(p * S), 0] * R
        //    R' * [(p * S), 0] = A
        //        (0 * -Rx) + (Sx * x * Rw) + (Sy * y * -Rz) - (Sz * z * -Ry)
        //        (0 * -Ry) - (Sx * x * -Rz) + (Sy * y * Rw) + (Sz * z * -Rx)
        //        (0 * -Rz) + (Sx * x * -Ry) - (Sy * y * -Rx) + (Sz * z * Rw)
        //        (0 * Rw) - (Sx * x * -Rx) - (Sy * y * -Ry) - (Sz * z * -Rz)
        //    (R' * [(p * S), 0]) * R = A * R
        //        (Rw * Ax) + (Rx * Aw) + (Ry * Az) - (Rz * Ay)
        //        (Rw * Ay) - (Rx * Az) + (Ry * Aw) + (Rz * Ax)
        //        (Rw * Az) + (Rx * Ay) - (Ry * Ax) + (Rz * Aw)
        //        (Rw * Aw) - (Rx * Ax) - (Ry * Ay) - (Rz * Az)     -> discard w
        //    A * R - p =
        //        (Rw * Ax) + (Rx * Aw) + (Ry * Az) - (Rz * Ay) - x
        //        (Rw * Ay) - (Rx * Az) + (Ry * Aw) + (Rz * Ax) - y
        //        (Rw * Az) + (Rx * Ay) - (Ry * Ax) + (Rz * Aw) - z
        //    p * T - p =
        //        (Rw * ((Sx * x * Rw) + (Sy * y * -Rz) - (Sz * z * -Ry))) + (Rx * (- (Sx * x * -Rx) - (Sy * y * -Ry) - (Sz * z * -Rz))) + (Ry * ((Sx * x * -Ry) - (Sy * y * -Rx) + (Sz * z * Rw))) - (Rz * (- (Sx * x * -Rz) + (Sy * y * Rw) + (Sz * z * -Rx))) - x
        //        (Rw * (- (Sx * x * -Rz) + (Sy * y * Rw) + (Sz * z * -Rx))) - (Rx * ((Sx * x * -Ry) - (Sy * y * -Rx) + (Sz * z * Rw))) + (Ry * (- (Sx * x * -Rx) - (Sy * y * -Ry) - (Sz * z * -Rz))) + (Rz * ((Sx * x * Rw) + (Sy * y * -Rz) - (Sz * z * -Ry))) - y
        //        (Rw * ((Sx * x * -Ry) - (Sy * y * -Rx) + (Sz * z * Rw))) + (Rx * (- (Sx * x * -Rz) + (Sy * y * Rw) + (Sz * z * -Rx))) - (Ry * ((Sx * x * Rw) + (Sy * y * -Rz) - (Sz * z * -Ry))) + (Rz * (- (Sx * x * -Rx) - (Sy * y * -Ry) - (Sz * z * -Rz))) - z
        //    p * T - p = (simplifying and re-order)
        //        (Sx * Rw * Rw * x) + (Sy * -Rz * Rw * y) - (Sz * -Ry * Rw * z) - (Sx * -Rx * Rx * x) - (Sy * -Ry * Rx * y) - (Sz * -Rz * Rx * z) + (Sx * -Ry * Ry * x) - (Sy * -Rx * Ry * y) + (Sz * Rw * Ry * z) + (Sx * -Rz * Rz * x) - (Sy * Rw * Rz * y) - (Sz * -Rx * Rz * z) - x
        //        - (Sx * -Rz * Rw * x) + (Sy * Rw * Rw * y) + (Sz * -Rx * Rw * z) - (Sx * -Ry * Rx * x) + (Sy * -Rx * Rx * y) - (Sz * Rw * Rx * z) - (Sx * -Rx * Ry * x) - (Sy * -Ry * Ry * y) - (Sz * -Rz * Ry * z) + (Sx * Rw * Rz * x) + (Sy * -Rz * Rz * y) - (Sz * -Ry * Rz * z) - y
        //        (Sx * -Ry * Rw * x) - (Sy * -Rx * Rw * y) + (Sz * Rw * Rw * z) - (Sx * -Rz * Rx * x) + (Sy * Rw * Rx * y) + (Sz * -Rx * Rx * z) - (Sx * Rw * Ry * x) - (Sy * -Rz * Ry * y) + (Sz * -Ry * Ry * z) - (Sx * -Rx * Rz * x) - (Sy * -Ry * Rz * y) - (Sz * -Rz * Rz * z) - z
        //    p * T - p = (grouping xyz)
        //        (Sx * Rw * Rw * x) - (Sx * -Rx * Rx * x) + (Sx * -Ry * Ry * x) + (Sx * -Rz * Rz * x) - x + (Sy * -Rz * Rw * y) - (Sy * -Ry * Rx * y) - (Sy * -Rx * Ry * y) - (Sy * Rw * Rz * y) - (Sz * -Ry * Rw * z) - (Sz * -Rz * Rx * z) + (Sz * Rw * Ry * z) - (Sz * -Rx * Rz * z)
        //        - (Sx * -Rz * Rw * x) - (Sx * -Ry * Rx * x) - (Sx * -Rx * Ry * x) + (Sx * Rw * Rz * x) + (Sy * Rw * Rw * y) + (Sy * -Rx * Rx * y) - (Sy * -Ry * Ry * y) + (Sy * -Rz * Rz * y) - y + (Sz * -Rx * Rw * z) - (Sz * Rw * Rx * z) - (Sz * -Rz * Ry * z) - (Sz * -Ry * Rz * z)
        //        (Sx * -Ry * Rw * x) - (Sx * -Rz * Rx * x) - (Sx * Rw * Ry * x) - (Sx * -Rx * Rz * x) - (Sy * -Rx * Rw * y) + (Sy * Rw * Rx * y) - (Sy * -Rz * Ry * y) - (Sy * -Ry * Rz * y) + (Sz * Rw * Rw * z) + (Sz * -Rx * Rx * z) + (Sz * -Ry * Ry * z) - (Sz * -Rz * Rz * z) - z
        //    p * T - p = (factoring xyz)
        //        ((Sx * Rw * Rw) - (Sx * -Rx * Rx) + (Sx * -Ry * Ry) + (Sx * -Rz * Rz) - 1) * x + ((Sy * -Rz * Rw) - (Sy * -Ry * Rx) - (Sy * -Rx * Ry) - (Sy * Rw * Rz)) * y + (- (Sz * -Ry * Rw) - (Sz * -Rz * Rx) + (Sz * Rw * Ry) - (Sz * -Rx * Rz)) * z
        //        (- (Sx * -Rz * Rw) - (Sx * -Ry * Rx) - (Sx * -Rx * Ry) + (Sx * Rw * Rz)) * x + ((Sy * Rw * Rw) + (Sy * -Rx * Rx) - (Sy * -Ry * Ry) + (Sy * -Rz * Rz) - 1) * y + ((Sz * -Rx * Rw) - (Sz * Rw * Rx) - (Sz * -Rz * Ry) - (Sz * -Ry * Rz)) * z
        //        ((Sx * -Ry * Rw) - (Sx * -Rz * Rx) - (Sx * Rw * Ry) - (Sx * -Rx * Rz)) * x + (- (Sy * -Rx * Rw) + (Sy * Rw * Rx) - (Sy * -Rz * Ry) - (Sy * -Ry * Rz)) * y + ((Sz * Rw * Rw) + (Sz * -Rx * Rx) + (Sz * -Ry * Ry) - (Sz * -Rz * Rz) - 1) * z
        //    p * T - p = (collapsing coefficients)
        //        a * x + b * y + c * z
        //        d * x + e * y + f * z
        //        g * x + h * y * i * z
        //    |p * T - p|^2 =
        //        (a * x + b * y + c * z)^2 + (d * x + e * y + f * z)^2 + (g * x + h * y * i * z)^2
        //        ((a^2 * x^2) + (2 * a * b * x * y) + (2 * a * c * x * z) + (b^2 * y^2) + (2 * b * c * y * z) + (c^2 * z^2))
        //            + ((d^2 * x^2) + (2 * d * e * x * y) + (2 * d * f * x * z) + (e^2 * y^2) + (2 * e * f * y * z) + (f^2 * z^2))
        //            + ((g^2 * x^2) + (2 * g * h * x * y) + (2 * g * i * x * z) + (h^2 * y^2) + (2 * h * i * y * z) + (i^2 * z^2))
        //
        //    To find where the maximum is, we must evaluate the function at its critical points or at end points
        //    Its critical points are where the derivative is zero or undefined
        //    Our domain for [x,y,z] is [-1, 1] because we know the point lives on the unit circle
        //
        //    Let us remove one variable (z) by expressing it in terms of [x,y] using the equation from the unit circle
        //    x^2 + y^2 + z^2 = 1
        //    z = sqrt(1 - x^2 - y^2)
        //
        //    |p * T - p|^2 =
        //        (ax + by + c * sqrt(1 - x^2 - y^2))^2 + (dx + ey + f * sqrt(1 - x^2 - y^2))^2 + (gx + hy * i * sqrt(1 - x^2 - y^2))^2
        //
        //    We now have two variables remaining, let us compute both derivatives
        //    d/dx =
        //        2 * (a - cx / (sqrt(1 - x^2 - y^2))) * (ax + by + c * sqrt(1 - x^2 - y^2))
        //            + 2 * (d - fx / (sqrt(1 - x^2 - y^2))) * (dx + ey + f * sqrt(1 - x^2 - y^2))
        //            + 2 * (g - ix / (sqrt(1 - x^2 - y^2))) * (gx + hy + i * sqrt(1 - x^2 - y^2))
        //    d/dy =
        //        2 * (b - cy / (sqrt(1 - x^2 - y^2))) * (ax + by + c * sqrt(1 - x^2 - y^2))
        //            + 2 * (e - fy / (sqrt(1 - x^2 - y^2))) * (dx + ey + f * sqrt(1 - x^2 - y^2))
        //            + 2 * (h - iy / (sqrt(1 - x^2 - y^2))) * (gx + hy + i * sqrt(1 - x^2 - y^2))

        // TODO: Maybe solve in 2D first, with scaled circle
        //       Next, can we solve 3D by considering it as a 2D problem since the point we are
        //       looking for lives on the rotation plane? The plane intersects the scaled sphere
        //       which should yield a scaled circle
        //       If the point we want lives on the rotation plane, we can transform the rotation
        //       plane to match the XY plane (by rotating the rotation axis and scale using sandwich product)
        //       Then we can solve in the XY as we do in 2D
        //       We can then transform the XY plane point back onto our rotation plane
        //       This should work as long as the point lives on the rotation plane
        //       This way, in 2D, we can solve for X by substituting sqrt(1 - X^2) for Y
        //       This yields a single variable equation that we can maximize with the
        //       derivative. We just need to apply the rotation/scale 2D matrix to find
        //       our equation. From X, we can compute Y.
        //       We can probably project the 3D scale onto our rotation plane by taking the two points
        //       on the circle/plane intersection along the XY extremes. Those points are on the deformed
        //       sphere, we can apply the inverse rotation to find where they began on the sphere and
        //       then apply the scale factor and the rotation again? Not sure.

        // f = |p * T - p|^2
        // Let us consider this on the XY plane
        // p * T = [x, y] * [[Sx * cos(R), -sin(R)], [sin(R), Sy * cos(R)]]
        // p * T =
        //     [x * Sx * cos(R) + y * sin(R), y * Sy * cos(R) - x * sin(R)]
        // p * T - p =
        //     [x * Sx * cos(R) - x + y * sin(R), y * Sy * cos(R) - y - x * sin(R)]
        // |p * T - p|^2 =
        //     (x * Sx * cos(R) - x + y * sin(R))^2 + (y * Sy * cos(R) - y - x * sin(R))^2
        // Replacing with: y = sqrt(1 - x^2)
        // |p * T - p|^2 =
        //     (x * Sx * cos(R) - x + sqrt(1 - x^2) * sin(R))^2 + (sqrt(1 - x^2) * Sy * cos(R) - sqrt(1 - x^2) - x * sin(R))^2
        // Collapse constants
        // |p * T - p|^2 =
        //     ((a - 1) * x + b * sqrt(1 - x^2))^2 + ((c - 1) * sqrt(1 - x^2) - d * x)^2
        // Where:
        //     a = Sx * cos(R)
        //     b = sin(R)
        //     c = Sy * cos(R)
        //     d = sin(R)
        // Let's evaluate with a few values
        // S = [3, 1], R = -90deg
        //     a = 3 * cos(-90)
        //     b = sin(-90)
        //     c = 1 * cos(-90)
        //     d = sin(-90)
        //     ((3 * cos(-90) - 1) * x + sin(-90) * sqrt(1 - x^2))^2 + ((1 * cos(-90) - 1) * sqrt(1 - x^2) - sin(-90) * x)^2

        // With: S = [3, 1], R = -90deg
        //     We get: sqrt((sqrt(1 - x^2) - x)^2 + (-3 x - sqrt(1 - x^2))^2)
        //     Max: sqrt(1/2 + 1/sqrt(5))
        // With: S = [1, 2], R = -90deg
        //     We get: sqrt((2 * sqrt(1 - x^2) - x)^2 + (-sqrt(1 - x^2) - x)^2)
        //     Max: -sqrt(1/26 * (13 - 3 * sqrt(13)))
        // With: S = [3, 1], R = 20deg
        //     We get: sqrt((3 * x * cos(20) - sqrt(1 - x^2) * sin(20) - x)^2 + (sqrt(1 - x^2) * cos(20) + 3 * x * sin(20) - sqrt(1 - x^2))^2)
        //     Max: -0.98785 (local, no global?)

        // |T * p - p| =
        //     sqrt((x * Sx * cos(R) - Sy * sqrt(1 - x^2) * sin(R) - x)^2 +(x * Sx * sin(R) + Sy * sqrt(1 - x^2) * cos(R) - sqrt(1 - x^2))^2)
        // Derivative
        //     (Sx - Sy) * (sin(R) * (sqrt(1 - x^2) * x * (Sx + Sy) * sin(R) + 2 * x - 1) + x * sqrt(1 - x^2) * (Sx + Sy) * cos^2(R) - 2 * x * sqrt(1 - x^2) * cos(R))
        //   / (sqrt(1 - x^2) * sqrt(((Sx * x * sin(R) + Sy * sqrt(1 - x^2) * cos(R) - sqrt(1 - x^2))^2 + (Sx * x * cos(R) - Sy * sqrt(1 - x^2) * sin(R) - x)^2)))
        //
        // Where is derivative zero?

        // |T * p - p| = (with normalized scale with Sx -> 1, Sy -> Sy/Sx = S and 0 <= S <= 1)
        //     sqrt((x * cos(R) - S * sqrt(1 - x^2) * sin(R) - x)^2 + (x * sin(R) + S * sqrt(1 - x^2) * cos(R) - sqrt(1 - x^2))^2)
        //     sqrt((x * (cos(R) - 1) - S * sin(R) * sqrt(1 - x^2))^2 + (x * sin(R) + (S * cos(R) - 1) * sqrt(1 - x^2))^2)
        // |T * p - p| = (with normalized scale with Sy -> 1, Sx -> Sx/Sy = S and 0 <= S <= 1)
        //     sqrt((x * (S * cos(R) - 1) - sin(R) * sqrt(1 - x^2))^2 + (x * S * sin(R) + (cos(R) - 1) * sqrt(1 - x^2))^2)
        // Derive with: derive{(x * (a * cos(b) - 1) - sin(b) * sqrt(1 - x^2))^2 + (x * a * sin(b) + (cos(b) - 1) * sqrt(1 - x^2))^2}
        //     2 * (a - 1) * (x * sqrt(1 - x^2) * (a - 2 * cos(b) + 1) + (2 * x^2 - 1) * sin(b)) / sqrt(1 - x^2)
        // Solve with: solve{2 * (a - 1) * (x * sqrt(1 - x^2) * (a - 2 * cos(b) + 1) + (2 * x^2 - 1) * sin(b)) / sqrt(1 - x^2)}
        //     Divide both sides by constant: 2 * (a - 1)
        //     (x * sqrt(1 - x^2) * (a - 2 * cos(b) + 1) + (2 * x^2 - 1) * sin(b)) / sqrt(1 - x^2) = 0
        //     Multiply by sqrt(1 - x^2) to remove fraction
        //     x * sqrt(1 - x^2) * (a - 2 * cos(b) + 1) + (2 * x^2 - 1) * sin(b) = 0
        //     Isolate radical to the left by subtracting (2 * x^2 - 1) * sin(b)
        //     x * sqrt(1 - x^2) * (a - 2 * cos(b) + 1) = (2 * x^2 - 1) * sin(b) * -1
        //     Remove square root by raising to power of two
        //     x^2 * (1 - x^2) * (a - 2 * cos(b) + 1)^2 = (2 * x^2 - 1)^2 * sin(b)^2
        //     Expand and collect terms of x on left hand side
        //     x^4 * (-1 - 2 * a - a^2 + 4 * cos(b) + 4 * a * cos(b) - 4 * cos(b)^2) + x^2 * (1 + 2 * a + a^2 - 4 * cos(b) - 4 * a * cos(b)^2) = (2 * x^2 - 1)^2 * sin(b)^2
        //     Expand the right hand side
        //     x^4 * (-1 - 2 * a - a^2 + 4 * cos(b) + 4 * a * cos(b) - 4 * cos(b)^2) + x^2 * (1 + 2 * a + a^2 - 4 * cos(b) - 4 * a * cos(b)^2) = sin(b)^2 - 4 * x^2 * sin(b)^2 + 4 * x^4 * sin(b)^2
        //     Move everything to the left
        //     x^4 * (-1 - 2 * a - a^2 + 4 * cos(b) + 4 * a * cos(b) - 4 * cos(b)^2) + x^2 * (1 + 2 * a + a^2 - 4 * cos(b) - 4 * a * cos(b)^2) - sin(b)^2 + 4 * x^2 * sin(b)^2 - 4 * x^4 * sin(b)^2 = 0
        //     Expand and collect terms of x
        //     -sin(b)^2 + x^4 * (-1 - 2a - a^2 + 4cos(b) + 4acos(b) - 4cos(b)^2 - 4sin(b)^2) + x^2 * (1 + 2a + a^2 - 4cos(b) - 4acos(b) + 4cos(b)^2 + 4sin(b)^2) = 0
        //     Simplify with identity: sin(b)^2 + cos(b)^2 = 1
        //     -sin(b)^2 + x^4 * (-5 - 2a - a^2 + 4cos(b) + 4acos(b)) + x^2 * (5 + 2a + a^2 - 4cos(b) - 4acos(b)) = 0
        //     Simplify with identity: sin(b)^2 = 1/2 * (1 - cos(2b))
        //     -1/2 + cos(2b)/2 + x^4 * (-5 - 2a - a^2 + 4cos(b) + 4acos(b)) + x^2 * (5 + 2a + a^2 - 4cos(b) - 4acos(b)) = 0
        //     Simplify by substituting: x = x^2
        //     -1/2 + cos(2b)/2 + x * (5 + 2a + a^2 - 4cos(b) - 4acos(b)) + x^2 * (-5 - 2a - a^2 + 4cos(b) + 4acos(b)) = 0
        //     Solve for x
        //     +- sqrt((5 + 2a + a^2 - 4cos(b) - 4acos(b))^2 / (4 * (-5 - 2a - a^2 + 4cos(b) + 4acos(b))^2) - (1/2 * cos(2b) - 1/2) / (-5 -2a - a^2 + 4cos(b) + 4acos(b)))
        //     Backsubstitute in: x = x^2 and solve for x yields 4 possible solutions
        //     Let W = a^2 - 4a * cos(b) + 2a + 4sin(b)^2 + 4cos(b)^2 - 4cos(b) + 1
        //     Let Z = sqrt(a^2 - 4a * cos(b) + 2a - 4cos(b) + 5)
        //     x0 = -1 / sqrt(2) * sqrt((a^2 / W) - (4a * cos(b) / W) + (a * Z / W) + (2a / W) + (4cos(b)^2 / W) + (4sin(b)^2 / W) - (4cos(b) / W) - (2cos(b) * Z / W) + (Z / W) + (1 / W))
        //     x1 =  1 / sqrt(2) * sqrt((a^2 / W) - (4a * cos(b) / W) + (a * Z / W) + (2a / W) + (4cos(b)^2 / W) + (4sin(b)^2 / W) - (4cos(b) / W) - (2cos(b) * Z / W) + (Z / W) + (1 / W))
        //     x2 = -1 / sqrt(2) * sqrt((a^2 / W) - (4a * cos(b) / W) - (a * Z / W) + (2a / W) + (4cos(b)^2 / W) + (4sin(b)^2 / W) - (4cos(b) / W) + (2cos(b) * Z / W) - (Z / W) + (1 / W))
        //     x3 =  1 / sqrt(2) * sqrt((a^2 / W) - (4a * cos(b) / W) - (a * Z / W) + (2a / W) + (4cos(b)^2 / W) + (4sin(b)^2 / W) - (4cos(b) / W) + (2cos(b) * Z / W) - (Z / W) + (1 / W))
        //  With: S = [3, 1], R = -90deg
        //     W = 20, Z = 2 * sqrt(5)
        //     x0 = -0.9732, x1 = 0.9732, x2 = -0.2297, x3 = 0.2297
        //
        //  THIS WORKS!!! As long as abs(scale.x) > abs(scale.y) and is very close even when scale.y is very small or zero
        //
        // |T * p - p|^2 = (with Sx = a, Sy = b, Rot Angle = c)
        //     (ax * cos(c) - b * sqrt(1 - x^2) * sin(c) - x)^2 + (ax * sin(c) + b * sqrt(1 - x^2) * cos(c) - sqrt(1 - x^2))^2
        // Derive with: derive{(ax * cos(c) - b * sqrt(1 - x^2) * sin(c) - x)^2 + (ax * sin(c) + b * sqrt(1 - x^2) * cos(c) - sqrt(1 - x^2))^2}
        //     (2 * (a - b) * (x * sqrt(1 - x^2) * (a + b - 2cos(c)) - ((1 - 2x^2) * sin(c)))) / sqrt(1 - x^2)
        // Solve with: solve{(2 * (a - b) * (x * sqrt(1 - x^2) * (a + b - 2cos(c)) - ((1 - 2x^2) * sin(c)))) / sqrt(1 - x^2)}
        //     Let U = a^2 + 2ab - 4a * cos(c) + b^2 - 4b * cos(c) + 4sin(c)^2 + 4cos(c)^2
        //     Let V = sqrt(a^2 + 2ab - 4a * cos(c) + b^2 - 4b * cos(c) + 4)
        //     x0 = -(1 / sqrt(2)) * sqrt((a^2 / U) + (2ab / U) - ((4a * cos(c)) / U) + (aV / U) + (b^2 / U) + ((4 * cos(c)^2) / U) + ((4 * sin(c)^2) / U) - ((4b * cos(c)) / U) + (bV / U) - ((2 * cos(c) * V) / U))
        //     x1 =  (1 / sqrt(2)) * sqrt((a^2 / U) + (2ab / U) - ((4a * cos(c)) / U) + (aV / U) + (b^2 / U) + ((4 * cos(c)^2) / U) + ((4 * sin(c)^2) / U) - ((4b * cos(c)) / U) + (bV / U) - ((2 * cos(c) * V) / U))
        //     x2 = -(1 / sqrt(2)) * sqrt((a^2 / U) + (2ab / U) - ((4a * cos(c)) / U) - (aV / U) + (b^2 / U) + ((4 * cos(c)^2) / U) + ((4 * sin(c)^2) / U) - ((4b * cos(c)) / U) - (bV / U) + ((2 * cos(c) * V) / U))
        //     x3 =  (1 / sqrt(2)) * sqrt((a^2 / U) + (2ab / U) - ((4a * cos(c)) / U) - (aV / U) + (b^2 / U) + ((4 * cos(c)^2) / U) + ((4 * sin(c)^2) / U) - ((4b * cos(c)) / U) - (bV / U) + ((2 * cos(c) * V) / U))

        // TODO: Work out formula with both XY scale
        // Find formula with matrix math
        // Calculate derivative
        // Solve for zero
        // Measure result!


        {
            const rotationAngle = rotationAngleRad;
            const sinAngle = Math.sin(rotationAngle);
            const cosAngle = Math.cos(rotationAngle);
            const scaleX = this.scale.x;

            const W = (scaleX * scaleX) - (4.0 * scaleX * cosAngle) + (2.0 * scaleX) + (4.0 * sinAngle * sinAngle) + (4.0 * cosAngle * cosAngle) - (4.0 * cosAngle) + 1;

            const Z = Math.sqrt((scaleX * scaleX) - (4.0 * scaleX * cosAngle) + (2.0 * scaleX) - (4.0 * cosAngle) + 5.0);

            const x0 = (-1.0 / Math.sqrt(2)) * Math.sqrt(((scaleX * scaleX) / W) - ((4.0 * scaleX * cosAngle) / W) + ((scaleX * Z) / W) + ((2.0 * scaleX) / W) + ((4.0 * cosAngle * cosAngle) / W) + ((4.0 * sinAngle * sinAngle) / W) - ((4.0 * cosAngle) / W) - ((2.0 * cosAngle * Z) / W) + (Z / W) + (1.0 / W));
            const x1 = -x0;
            const x2 = (-1.0 / Math.sqrt(2)) * Math.sqrt(((scaleX * scaleX) / W) - ((4.0 * scaleX * cosAngle) / W) - ((scaleX * Z) / W) + ((2.0 * scaleX) / W) + ((4.0 * cosAngle * cosAngle) / W) + ((4.0 * sinAngle * sinAngle) / W) - ((4.0 * cosAngle) / W) + ((2.0 * cosAngle * Z) / W) - (Z / W) + (1.0 / W));
            const x3 = -x2;
            const x4 = -1.0;
            const x5 = 1.0;

            const errorSqFun = function(x, scaleX, sinAngle, cosAngle)
            {
                const transformedX = (x * (scaleX * cosAngle - 1.0)) - (sinAngle * Math.sqrt(1.0 - (x * x)));
                const transformedY = (x * scaleX * sinAngle) + ((cosAngle - 1.0) * Math.sqrt(1.0 - (x * x)));
                return (transformedX * transformedX) + (transformedY * transformedY);
            };

            const errorSq0 = errorSqFun(x0, scaleX, sinAngle, cosAngle);
            const errorSq1 = errorSqFun(x1, scaleX, sinAngle, cosAngle);
            const errorSq2 = errorSqFun(x2, scaleX, sinAngle, cosAngle);
            const errorSq3 = errorSqFun(x3, scaleX, sinAngle, cosAngle);
            const errorSq4 = errorSqFun(x4, scaleX, sinAngle, cosAngle);
            const errorSq5 = errorSqFun(x5, scaleX, sinAngle, cosAngle);

            let bestX = x0;
            let bestErrorSq0 = errorSq0;
            if (errorSq1 > bestErrorSq0) {
                bestX = x1;
                bestErrorSq0 = errorSq1;
            }
            if (errorSq2 > bestErrorSq0) {
                bestX = x2;
                bestErrorSq0 = errorSq2;
            }
            if (errorSq3 > bestErrorSq0) {
                bestX = x3;
                bestErrorSq0 = errorSq3;
            }
            if (errorSq4 > bestErrorSq0) {
                bestX = x4;
                bestErrorSq0 = errorSq4;
            }
            if (errorSq5 > bestErrorSq0) {
                bestX = x5;
                bestErrorSq0 = errorSq5;
            }

            const errorSqFun2 = function(x, y, scaleX, sinAngle, cosAngle)
            {
                const transformedX = (x * (scaleX * cosAngle - 1.0)) - (sinAngle * y);
                const transformedY = (x * scaleX * sinAngle) + ((cosAngle - 1.0) * y);
                return (transformedX * transformedX) + (transformedY * transformedY);
            };

            const y0 = Math.sqrt(1.0 - (bestX * bestX));
            const y1 = -y0;

            const errorSq00 = errorSqFun2(bestX, y0, scaleX, sinAngle, cosAngle);
            const errorSq01 = errorSqFun2(bestX, y1, scaleX, sinAngle, cosAngle);

            let bestY = y0;
            let bestErrorSq1 = errorSq00;

            // TODO: Is this necessary?
            if (errorSq01 > bestErrorSq1) {
                bestY = y1;
                bestErrorSq1 = errorSq01;
            }

            //console.log(`x0=${x0}, x1=${x1}, x2=${x2}, x3=${x3}, x4=${x4}, x5=${x5}, y0=${y0}, y1=${y1}`);
            //console.log(`e0=${errorSq0}, e1=${errorSq1}, e2=${errorSq2}, e3=${errorSq3}, e4=${errorSq4}, e5=${errorSq5}, eA=${errorSq00}, eB=${errorSq01}`);

            errorPoint = new Vector3(bestX, bestY, 0.0);
        }

        {
            // E = (ax * cos(c) - b * sqrt(1 - x^2) * sin(c) - x)^2 + (ax * sin(c) + b * sqrt(1 - x^2) * cos(c) - sqrt(1 - x^2))^2
            //
            // Let U = a^2 + 2ab - 4a * cos(c) + b^2 - 4b * cos(c) + 4sin(c)^2 + 4cos(c)^2
            // Let V = sqrt(a^2 + 2ab - 4a * cos(c) + b^2 - 4b * cos(c) + 4)
            // x0 = -(1 / sqrt(2)) * sqrt((a^2 / U) + (2ab / U) - ((4a * cos(c)) / U) + (aV / U) + (b^2 / U) + ((4 * cos(c)^2) / U) + ((4 * sin(c)^2) / U) - ((4b * cos(c)) / U) + (bV / U) - ((2 * cos(c) * V) / U))
            // x1 =  (1 / sqrt(2)) * sqrt((a^2 / U) + (2ab / U) - ((4a * cos(c)) / U) + (aV / U) + (b^2 / U) + ((4 * cos(c)^2) / U) + ((4 * sin(c)^2) / U) - ((4b * cos(c)) / U) + (bV / U) - ((2 * cos(c) * V) / U))
            // x2 = -(1 / sqrt(2)) * sqrt((a^2 / U) + (2ab / U) - ((4a * cos(c)) / U) - (aV / U) + (b^2 / U) + ((4 * cos(c)^2) / U) + ((4 * sin(c)^2) / U) - ((4b * cos(c)) / U) - (bV / U) + ((2 * cos(c) * V) / U))
            // x3 =  (1 / sqrt(2)) * sqrt((a^2 / U) + (2ab / U) - ((4a * cos(c)) / U) - (aV / U) + (b^2 / U) + ((4 * cos(c)^2) / U) + ((4 * sin(c)^2) / U) - ((4b * cos(c)) / U) - (bV / U) + ((2 * cos(c) * V) / U))

            const rotationAngle = rotationAngleRad;
            const sinAngle = Math.sin(rotationAngle);
            const cosAngle = Math.cos(rotationAngle);
            const scaleX = this.scale.x;
            const scaleY = this.scale.y;

            const U = (scaleX * scaleX) + (2.0 * scaleX * scaleY) - (4.0 * scaleX * cosAngle) + (scaleY * scaleY) - (4.0 * scaleY * cosAngle) + (4.0 * sinAngle * sinAngle) + (4.0 * cosAngle * cosAngle);
            const V = Math.sqrt((scaleX * scaleX) + (2.0 * scaleX * scaleY) - (4.0 * scaleX * cosAngle) + (scaleY * scaleY) - (4.0 * scaleY * cosAngle) + 4.0);

            const x0 = (1.0 / Math.sqrt(2.0)) * Math.sqrt(((scaleX * scaleX) / U) + ((2.0 * scaleX * scaleY) / U) - ((4.0 * scaleX * cosAngle) / U) + ((scaleX * V) / U) + ((scaleY * scaleY) / U) + ((4.0 * cosAngle * cosAngle) / U) + ((4.0 * sinAngle * sinAngle) / U) - ((4.0 * scaleY * cosAngle) / U) + ((scaleY * V) / U) - ((2.0 * cosAngle * V) / U));
            const x1 = -x0;
            const x2 = (1.0 / Math.sqrt(2.0)) * Math.sqrt(((scaleX * scaleX) / U) + ((2.0 * scaleX * scaleY) / U) - ((4.0 * scaleX * cosAngle) / U) - ((scaleX * V) / U) + ((scaleY * scaleY) / U) + ((4.0 * cosAngle * cosAngle) / U) + ((4.0 * sinAngle * sinAngle) / U) - ((4.0 * scaleY * cosAngle) / U) - ((scaleY * V) / U) + ((2.0 * cosAngle * V) / U));
            const x3 = -x2;
            const x4 = -1.0;
            const x5 = 1.0;

            const errorSqFun = function(x, scaleX, scaleY, sinAngle, cosAngle)
            {
                const transformedX = (x * scaleX * cosAngle - scaleY * Math.sqrt(1.0 - (x * x)) * sinAngle - x);
                const transformedY = (x * scaleX * sinAngle + scaleY * Math.sqrt(1.0 - (x * x)) * cosAngle - Math.sqrt(1 - (x * x)));
                return (transformedX * transformedX) + (transformedY * transformedY);
            };

            const errorSq0 = errorSqFun(x0, scaleX, scaleY, sinAngle, cosAngle);
            const errorSq1 = errorSqFun(x1, scaleX, scaleY, sinAngle, cosAngle);
            const errorSq2 = errorSqFun(x2, scaleX, scaleY, sinAngle, cosAngle);
            const errorSq3 = errorSqFun(x3, scaleX, scaleY, sinAngle, cosAngle);
            const errorSq4 = errorSqFun(x4, scaleX, scaleY, sinAngle, cosAngle);
            const errorSq5 = errorSqFun(x5, scaleX, scaleY, sinAngle, cosAngle);

            let bestX = x0;
            let bestErrorSq0 = errorSq0;
            if (errorSq1 > bestErrorSq0) {
                bestX = x1;
                bestErrorSq0 = errorSq1;
            }
            if (errorSq2 > bestErrorSq0) {
                bestX = x2;
                bestErrorSq0 = errorSq2;
            }
            if (errorSq3 > bestErrorSq0) {
                bestX = x3;
                bestErrorSq0 = errorSq3;
            }
            if (errorSq4 > bestErrorSq0) {
                bestX = x4;
                bestErrorSq0 = errorSq4;
            }
            if (errorSq5 > bestErrorSq0) {
                bestX = x5;
                bestErrorSq0 = errorSq5;
            }

            const errorSqFun2 = function(x, y, scaleX, sinAngle, cosAngle)
            {
                const transformedX = (x * (scaleX * cosAngle - 1.0)) - (sinAngle * y);
                const transformedY = (x * scaleX * sinAngle) + ((cosAngle - 1.0) * y);
                return (transformedX * transformedX) + (transformedY * transformedY);
            };

            const y0 = Math.sqrt(1.0 - (bestX * bestX));
            const y1 = -y0;

            const errorSq00 = errorSqFun2(bestX, y0, scaleX, sinAngle, cosAngle);
            const errorSq01 = errorSqFun2(bestX, y1, scaleX, sinAngle, cosAngle);

            let bestY = y0;
            let bestErrorSq1 = errorSq00;

            // TODO: Is this necessary?
            if (errorSq01 > bestErrorSq1) {
                bestY = y1;
                bestErrorSq1 = errorSq01;
            }

            // Something not quite right with: R= 72.27, S= [1.23, 1.68]
            // errorSqFun2 is incorrect!

            console.log(`x0=${x0}, x1=${x1}, x2=${x2}, x3=${x3}, x4=${x4}, x5=${x5}, y0=${y0}, y1=${y1}`);
            console.log(`e0=${errorSq0}, e1=${errorSq1}, e2=${errorSq2}, e3=${errorSq3}, e4=${errorSq4}, e5=${errorSq5}, eA=${errorSq00}, eB=${errorSq01}`);

            errorPoint = new Vector3(bestX, bestY, 0.0);
        }

        // We can further simplify our equation by dropping a scale variable
        // We can do so by removing the smallest scale component (or largest)
        // We will end up either with S = [a, 1] or S = [1, a]
        // If we remove the largest scale, then we know 'a' must be less than or equal to 1
        // Or we can always pick Sx or Sy for simplicity although that might break when they are 0
        // Figure out how to plot this (picked Sy = 1, Sx = z, R = y)
        // plot{sqrt((x * z * cos(y) - sqrt(1 - x^2) * sin(y) - x)^2 +(x * z * sin(y) + sqrt(1 - x^2) * cos(y) - sqrt(1 - x^2))^2)}

        // Wolfram Alpha inputs
        // Derive the transform delta formula
        //      derive{sqrt((x * a * cos(c) - b * sqrt(1 - x^2) * sin(c) - x)^2 +(x * a * sin(c) + b * sqrt(1 - x^2) * cos(c) - sqrt(1 - x^2))^2)}
        // Solve the hardcoded example: -90deg, [3,1], see maximum computation
        //      (sqrt(1 - x^2) - x)^2 + (-sqrt(1 - x^2) - 3*x)^2
        // Formula in matrix form
        //      {{cos(c),-sin(c)},{sin(c),cos(c)}}{{a,0},{0,b}}{{x},{sqrt(1 - x^2)}} -{{x},{sqrt(1 - x^2)}}
        // Formula with collapsed constants
        //      ((a - 1) * x + b * sqrt(1 - x^2))^2 + ((c - 1) * sqrt(1 - x^2) - d * x)^2
        // Formula with Sx -> 1
        //      sqrt((x * (cos(a) - 1) - b * sin(a) * sqrt(1 - x^2))^2 + (x * sin(a) + (b * cos(a) - 1) * sqrt(1 - x^2))^2)

        /////

        // If the point ends up at zero, it means that the translation is colinear
        // with the rotation plane normal and thus all points on that plane
        // will move by the same amount. As such, we can pick any point on the plane.
        //
        // If the rotation is zero, then all points move by the same amount of
        // translation and they thus all have the same error. As such, we can pick
        // any point on the circle.
        if (errorPoint.lengthSq() < 0.0001 && false) {
            // Generate a random point on our circle
            // To ensure consistent results, we pick between hardcoded perpendicular results
            let randomPoint = new Vector3(0.2, 0.7, 0.0).normalize();

            // Make sure it isn't colinear with our plane normal
            if (Math.abs(randomPoint.dot(errorPlaneNormal)) > 0.9) {
                randomPoint.set(0.2, 0.7, 0.0).normalize();
            }

            // Project it onto our plane
            // If the plane normal is zero as a result of a zero rotation,
            // we'll remove nothing from the random point and thus use it as-is.
            errorPoint = randomPoint.sub(errorPlaneNormal.clone()
                                            .multiplyScalar(randomPoint.dot(errorPlaneNormal)))
                            .normalize();
        }

        // Calculate the error of our desired point, it should match the max error we found
        console.log(`Computed point error: ${this.computeVertexDispError(errorPoint)} for point [${errorPoint.x}, ${errorPoint.y}, ${errorPoint.z}] len:${errorPoint.length()}`);

        // To compute the max error from the rotation, we proceed as follows:
        // We first take the quaternion W component
        // This gives us the cosine of the half rotation angle (remember that quaternions use a half angle representation)
        // We know the circle radius (1.0 in our case) and we can create a right-angle by splitting
        // the max error contribution in two equal halves.
        // We can then use the angle cosine and the circle radius to find the adjacent side of our triangle
        // Using the hypothenus and the adjacent side, we can compute the other side by leveraging the right-angle
        // This yields half the max rotation error
        const circleRadius = 1.0;
        const rotationErrorTriangleAdjacent = this.rotation.w * circleRadius;
        const halfMaxRotationError =
            Math.sqrt(Math.max((circleRadius * circleRadius) - (rotationErrorTriangleAdjacent * rotationErrorTriangleAdjacent), 0.0))
        const maxRotationError = halfMaxRotationError * 2.0;
        //console.log(`Max rotation error: ${maxRotationError}`);

        // The max translation error is simply its length
        //console.log(`Max translation error: ${this.translation.length()}`);

        // To compute the combined max error of the rotation and translation, we observe that
        // they form a triangle where one side has length equal to the max rotation error and
        // lives on the rotation plane. Another side has the translation.
        // Both of them form a triangle by forming an angle between them.
        // To avoid computing angles and using trigonometric functions, we instead build a larger
        // triangle where the hypothenus is the translation and one side is the projection
        // of the translation along the rotation plane normal. Using both sides, we can
        // compute the third using the square-root. This gives us a second portion of a larger
        // segment along the rotation plane. We add this second portion to our max rotation
        // error to form a larger right-angled triangle. That triangle still has the same side
        // as the first along the rotation plane normal. Again, using a square-root, we can compute
        // our third and final side we are looking for.
        const translationAlongPlane = this.translation.dot(errorPlaneNormal);
        const translationAlongPlaneSq = translationAlongPlane * translationAlongPlane;
        const innerSide =
            Math.sqrt(Math.max(this.translation.lengthSq() - translationAlongPlaneSq, 0.0));
        const innerFullSide = innerSide + maxRotationError;
        const maxTransformError =
            Math.sqrt(Math.max(translationAlongPlaneSq + (innerFullSide * innerFullSide), 0.0));

        // Edge cases:
        //   - Note that when the translation is zero, our distance along the normal will
        //     also be zero. This yields the translation contribution along the rotation plane
        //     to also be zero. We correctly end up taking the square-root of the squared max
        //     rotation error.
        //   - When the rotation is zero, only the translation portion will remain along
        //     the rotation plane normal (we can use any direction for the plane normal). This leaves
        //     us with a single triangle and we correctly re-compute the translation edge length.
        //   - When both are zero, we end up with zero as well by construction.

        console.log(`Computed max error: ${maxTransformError}`);

        // Update our error objects
        const errorPointLineSize = this.uiState.showMaxErrorLocation ? 2.0 : 0;
        const errorPointLineVertices = this.errorPointLine.geometry.attributes.position.array;
        errorPoint.clone().multiplyScalar(errorPointLineSize).toArray(errorPointLineVertices, 3);
        this.errorPointLine.geometry.attributes.position.needsUpdate = true;
    }

    update3DMetricErrorLocation() {
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
        console.log(`Computed point error: ${this.computeVertexMetricError(errorPoint)} for point [${errorPoint.x}, ${errorPoint.y}, ${errorPoint.z}]`);

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
            this.guiFolders.mode2DDisp.transformFolder.add(this.uiState.mode2DDisp, 'angle', -360.0, 360.0, 0.01),
            this.guiFolders.mode2DDisp.transformFolder.add(this.uiState.mode2DDisp, 'translationX', -20.0, 20.0, 0.01),
            this.guiFolders.mode2DDisp.transformFolder.add(this.uiState.mode2DDisp, 'translationY', -20.0, 20.0, 0.01),
            this.guiFolders.mode2DDisp.transformFolder.add(this.uiState.mode2DDisp, 'scaleX', -5.0, 5.0, 0.01),
            this.guiFolders.mode2DDisp.transformFolder.add(this.uiState.mode2DDisp, 'scaleY', -5.0, 5.0, 0.01),
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
