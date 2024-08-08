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

export class Viewer {

    constructor(el) {
        this.el = el;

        this.state = {
            numPoints: 4000,
            rawAxisYaw: 0.0,
            rawAxisPitch: 0.0,
            rawAngle: 20.0,
            rawTranslationX: 0.0,
            rawTranslationY: 0.0,
            rawTranslationZ: 0.0,
            rawScaleX: 1.0,
            rawScaleY: 1.0,
            rawScaleZ: 1.0,
            lossyAxisYaw: 0.0,//61.4,
            lossyAxisPitch: 0.0,
            lossyAngle: 128.6,
            lossyTranslationX: 0.0,//2.0,
            lossyTranslationY: 0.0,//5.0,
            lossyTranslationZ: 0.0,
            lossyScaleX: 1.0,
            lossyScaleY: 1.0,
            lossyScaleZ: 1.0,
            showMaxErrorLocation: true,
            isDirty: true,
        };

        this.transformWidgets = {};

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
            this.updateTransforms();
            this.calculateError();
            this.updateErrorHistogram();
            this.updateErrorLocation();

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

    buildWidgetLines() {
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

    updateTransforms() {
        this.buildWidgetLines();

        // Frame of reference (right handed):
        // X+ = Red (right)
        // Y+ = Green (up)
        // Z- = Blue (forward)

        const axisLength = 5.0;
        const angleLength = 1.5;

        // Setup our raw transform
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
        this.rawTranslation.set(this.state.rawTranslationX, this.state.rawTranslationY, this.state.rawTranslationZ);
        this.rawScale.set(this.state.rawScaleX, this.state.rawScaleY, this.state.rawScaleZ);

        // Setup our lossy transform
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
        this.lossyTranslation.set(this.state.lossyTranslationX, this.state.lossyTranslationY, this.state.lossyTranslationZ);
        this.lossyScale.set(this.state.lossyScaleX, this.state.lossyScaleY, this.state.lossyScaleZ);

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
        this.transformWidgets.translation.raw.geometry.attributes.position.needsUpdate = true;

        const lossyTranslationLineVertices = this.transformWidgets.translation.lossy.geometry.attributes.position.array;
        this.lossyTranslation.toArray(lossyTranslationLineVertices, 3);
        this.transformWidgets.translation.lossy.computeLineDistances();
        this.transformWidgets.translation.lossy.geometry.attributes.position.needsUpdate = true;
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

    computeVertexError(vertex) {
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

    computeVertexErrorNS(vertex) {
        // qvv_mul_point3:
        // vector_add(quat_mul_vector3(vector_mul(qvv.scale, point), qvv.rotation), qvv.translation);

        const rawVertex = vertex.clone()
            //.multiply(this.rawScale)
            .applyQuaternion(this.rawRotation)
            .add(this.rawTranslation);

        const lossyVertex = vertex.clone()
            //.multiply(this.lossyScale)
            .applyQuaternion(this.lossyRotation)
            .add(this.lossyTranslation);

        return rawVertex.distanceTo(lossyVertex);
    }

    calculateError() {
        this.errorPerVertex = [];

        let minError = 10000000.0;
        let maxError = -10000000.0;

        this.sphereVertices.forEach((v) => {
            const error = this.computeVertexError(v);
            this.errorPerVertex.push(error);

            minError = Math.min(minError, error);
            maxError = Math.max(maxError, error);
        });

        console.log(`Sphere max error: ${maxError}`);

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
        vector4f delta_s = vector_mul(lossy.s, inv_raw_s);
        */

        /*
        First we apply scale, then we rotate, and finally translate

        When no scale is present, the points that rotate the most live on the delta rotation plane.
        Points away from the plane will end up closer to the origin when projected on the plane and
        thus move less than those already on the plane. Combined with translation, the points that
        move the most on the plane are those that rotate the most towards/away from the delta translation.

        However, when scale is present, that may not be true. There may be a point that lives further
        away once projected onto the rotation plane. This can combine with translation in unintuitive ways.
        The point on the sphere furthest away from the origin may not be the one rotating the most once
        projected onto the rotation plane (e.g. scale could be perpendicular to the rotation plane).

        What if we project the scale factor onto the rotation plane? We can then pick the point furthest
        along that projected scale factor scaled by the sphere radius. That will give us the two points
        rotate the most (pos/neg projected scale factor). However it may be that another point moves
        more overall once translation is applied. How to find the combined point?

        Consider scale in the 2D plane. The same point would move the most for the following values:
        [2,1], [1,0.5], [1,0.8]
        That point is the furthest along the largest scale component under pure rotation. Is it
        still the case under translation? Perhaps we need to rotate the whole arc between the first two
        largest extents. As such, we need to project the 3D scale on the rotation plane, then take
        the absolute value of the scale to find the largest two extents.

        Can we approximate the result by using the largest scale extent as the sphere radius?





        We should be able to use the scale values to compute a conservatice sphere radius instead
        Keep in mind that the error metric measures the error between two vertices on the sphere
        If the sphere is scaled up/down uniformly then the error is scaled linearly
        But if the sphere is scaled non-uniformly, our error will grow depending how far we are from
        the ideal radius. We need to compute min/max values, and the delta between should be our error
        Something along those lines, a conservative estimate needs to account for the scale delta
        somehow

        Things break down with non-uniform scale because it is not associative. Going back to the
        basics, we have the following.

        Our error metric:
        a*R = b
        a*L = c
        error = |b - c|
        Where:
        a: an unknown local point around our transform
        R: the raw version of our transform
        L: the lossy version of our transform

        We would like to find the point 'b' local to the raw transform that moves the most and maximizes the error.
        b*R^-1*L = c

        This is equivalent to removing the raw transform contribution and applying the lossy transform.
        Thanks to associativity, we can combine both transforms into one:
        (b*R^-1)*L = b*(R^1*L) = b*D = c
        Where:
        D: a delta transform between the raw and lossy transforms: (R^-1 * L)

        This is what allows us with pure rotation/translation to use the delta transform to compute the point
        that moves the most. When uniform scale is present, associativity holds and we can use the same formula.
        However, when scale is non-uniform, we lose associativity.
        (b*R^-1)*L != b*(R^-1*L)

        This means that we have to consider the points that move the most under the inverse raw transform
        and the lossy transform separately.

        With non-uniform scale, points that live on axes with the largest absolute scale component are those
        that move the most under pure rotation (e.g. with scale [0.1, 1, 1], points along the YZ axes that
        intersect the sphere move the most as they are further away from the center). Mixing in translation
        slightly complicates things since the point now rotating the most towards the translation direction
        may not be near the points furthest from the sphere center. All we know is that the point that moves
        the most lives on the top or bottom half of the sphere (depending on the rotation direction). Let us
        consider the following example in 2D:
        Rotation: clockwise 45deg
        Translation: along the positive X axis by some value
        Scale: [1000.0, 1.0]
        If we look at the rotation plane and the translation direction, the point that rotates the most
        lives at the very top, where X=0.0 if the circle is centered. However, the point that lives at
        X=-1000.0, Y=0.0 still rotates towards the translation slightly and due to its distance from
        the circle center, it will move a lot more even if the contribution towards the translation is
        reduced. What we want to find is the point that rotates towards the translation direction that
        yields an overall largest displacement. Due to the non-uniform scaling, we don't know the radius
        at that point and so we can't calculate the rotation displacement. Can we find the radius?

        If I can find the point that moves the most with the inverse raw and inverse lossy transforms,
        then that gives me two points on my original sphere. The point that moves the most must lie along
        the arc formed by the two points, is it the mid-point?

        Can we check in excel in 2D? Try with sphere equation, rotation error equation, and translation error?
        */

        //const sphereRadius = 1.0;
        const sphereRadius = this.vectorMaxComponent(this.vectorMax(this.vectorAbs(this.rawScale), this.vectorAbs(this.lossyScale)));
        console.log(`Sphere radius: ${sphereRadius}`);

        // Compute our delta transform
        const invRawRotation = this.rawRotation.clone()
            .conjugate();
        //const invRawScale = new Vector3(1.0, 1.0, 1.0)
        //    .divide(this.rawScale);
        const invRawTranslation = this.rawTranslation.clone()
            //.multiply(invRawScale)
            .applyQuaternion(invRawRotation)
            .negate();  // Negate to match ThreeJS multiplication ordering

        const deltaRotation = invRawRotation.clone().multiply(this.lossyRotation);

        const deltaTranslation = this.lossyTranslation.clone()
            //.multiply(invRawScale)
            .applyQuaternion(invRawRotation)
            .add(invRawTranslation);

        //const deltaScale = this.lossyScale.clone()
        //    .multiply(invRawScale);
        //console.log(`Delta scale: ${deltaScale.x}, ${deltaScale.y}, ${deltaScale.z}`);

        const errorPlaneNormal = new Vector3(deltaRotation.x, deltaRotation.y, deltaRotation.z).normalize();
        const deltaRotationAngleRad = Math.acos(MathUtils.clamp(deltaRotation.w, -1.0, 1.0)) * 2.0;

        // Half the delta rotation, negated so we can remove it
        const negHalfDeltaRotation = new Quaternion().setFromAxisAngle(errorPlaneNormal, deltaRotationAngleRad * -0.5);

        // We project the delta translation onto error plane
        // The points that rotate the most lives on it
        const deltaTranslationCrossNormal = deltaTranslation.clone()
            .cross(errorPlaneNormal)
            .normalize();

        // TODO: we can't use the delta scale to compute the dominant scale axis because if both
        // raw and lossy have some identical non-identity scale, then the sphere is deformed regardless
        // of the delta and the point that moves the most is on the deformed sphere even though
        // the delta scale will be the identity scale (since the scale doesn't change between the two)
        // And so unlike with pure rotation/translation, when scale is present, we have to consider
        // the points from the raw/lossy spheres on the delta rotation plane. Perhaps the dominant
        // scale axis is the dominant between the raw/lossy: project both on rotation plane, take
        // absolute value of both, take maximum value of both, find largest axis

        // TODO: Should we use the dominant scale axis to pick which point to project on the plane above
        // with the delta translation? By using the cross product, we project on the plane at some
        // random position. Perhaps using scale we can pick the right position instead.

        // TODO: Perhaps we need to use the rotated raw scale to find the dominant axis/point since
        // the delta transform is from raw to lossy
        // Similarly, we can use the rotated lossy scale?

        // Project raw/lossy scale on delta rotation plane
        //const rawScaleOnRotationPlane = errorPlaneNormal.clone()
        //    .multiplyScalar(errorPlaneNormal.dot(this.rawScale))
        //    .negate()
        //    .add(this.rawScale);
        //const lossyScaleOnRotationPlane = errorPlaneNormal.clone()
        //    .multiplyScalar(errorPlaneNormal.dot(this.lossyScale))
        //    .negate()
        //    .add(this.lossyScale);

        // Find largest scale components from raw/lossy on the rotation plane
        //const maxAbsScaleOnRotationPlane = this.vectorMax(this.vectorAbs(rawScaleOnRotationPlane, lossyScaleOnRotationPlane));

        // The dominant scale axis on the rotation plane is where the points that move the most
        // live when we have pure rotation and no translation
        //const dominantScaleAxis = this.dominantAxis(maxAbsScaleOnRotationPlane);

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

        // Simply scale the sphere by its radius
        errorPoint.multiplyScalar(sphereRadius);

        // Calculate the error of our desired point, it should match the max error we found
        console.log(`Computed point error: ${this.computeVertexErrorNS(errorPoint)} (${errorPoint.x}, ${errorPoint.y}, ${errorPoint.z})`);

        // To compute the max error from the rotation delta, we proceed as follows:
        // We first take the quaternion dot product between the raw and lossy rotations
        // This gives us the cosine of the half rotation angle (remember that quaternions use a half angle representation)
        // We know the sphere radius (1.0 in our case) and we can create a right-angle by splitting
        // the max error contribution in two equal halves.
        // We can then use the angle cosine and the sphere radius to find the adjacent side of our triangle
        // Using the hypothenus and the adjacent side, we can compute the other side by leveraging the right-angle
        // This yields half the max rotation error
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
        this.errorPlaneHelper.size = this.state.showMaxErrorLocation ? 5 : 0;

        const errorPointLineSize = this.state.showMaxErrorLocation ? 2.0 : 0;
        const errorPointLineVertices = this.errorPointLine.geometry.attributes.position.array;
        errorPoint.clone().multiplyScalar(errorPointLineSize).toArray(errorPointLineVertices, 3);
        this.errorPointLine.geometry.attributes.position.needsUpdate = true;
    }

    resize() {
        const aspectRatio = this.el.clientWidth / this.el.clientHeight;

        this.camera.aspect = aspectRatio;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.el.clientWidth, this.el.clientHeight);
        this.state.isDirty = true;
    }

    setupGUI() {
        const gui = this.gui = new GUI({ autoPlace: false, width: 350, hideable: true });

        this.optionsFolder = gui.addFolder('Options');
        this.optionsFolder.closed = false;

        this.rawTransformFolder = gui.addFolder('Raw Transform');
        this.rawTransformFolder.closed = true;

        this.lossyTransformFolder = gui.addFolder('Lossy Transform');
        this.lossyTransformFolder.closed = false;

        [
            this.optionsFolder.add(this.state, 'numPoints', 10, 10000, 1),
            this.optionsFolder.add(this.state, 'showMaxErrorLocation'),
        ].forEach((ctrl) => ctrl.onFinishChange(() => this.state.isDirty = true));

        [
            this.rawTransformFolder.add(this.state, 'rawAxisYaw', -180.0, 180.0, 0.1),
            this.rawTransformFolder.add(this.state, 'rawAxisPitch', -180.0, 180.0, 0.1),
            this.rawTransformFolder.add(this.state, 'rawAngle', -180.0, 180.0, 0.1),
            this.rawTransformFolder.add(this.state, 'rawTranslationX', -20.0, 20.0, 0.1),
            this.rawTransformFolder.add(this.state, 'rawTranslationY', -20.0, 20.0, 0.1),
            this.rawTransformFolder.add(this.state, 'rawTranslationZ', -20.0, 20.0, 0.1),
            this.rawTransformFolder.add(this.state, 'rawScaleX', -5.0, 5.0, 0.1),
            this.rawTransformFolder.add(this.state, 'rawScaleY', -5.0, 5.0, 0.1),
            this.rawTransformFolder.add(this.state, 'rawScaleZ', -5.0, 5.0, 0.1),
        ].forEach((ctrl) => ctrl.onFinishChange(() => this.state.isDirty = true));

        [
            this.lossyTransformFolder.add(this.state, 'lossyAxisYaw', -180.0, 180.0, 0.1),
            this.lossyTransformFolder.add(this.state, 'lossyAxisPitch', -180.0, 180.0, 0.1),
            this.lossyTransformFolder.add(this.state, 'lossyAngle', -180.0, 180.0, 0.1),
            this.lossyTransformFolder.add(this.state, 'lossyTranslationX', -20.0, 20.0, 0.1),
            this.lossyTransformFolder.add(this.state, 'lossyTranslationY', -20.0, 20.0, 0.1),
            this.lossyTransformFolder.add(this.state, 'lossyTranslationZ', -20.0, 20.0, 0.1),
            this.lossyTransformFolder.add(this.state, 'lossyScaleX', -5.0, 5.0, 0.1),
            this.lossyTransformFolder.add(this.state, 'lossyScaleY', -5.0, 5.0, 0.1),
            this.lossyTransformFolder.add(this.state, 'lossyScaleZ', -5.0, 5.0, 0.1),
        ].forEach((ctrl) => ctrl.onFinishChange(() => this.state.isDirty = true));

        const guiWrap = document.createElement('div');
        this.el.appendChild(guiWrap);
        guiWrap.classList.add('gui-wrap');
        guiWrap.appendChild(gui.domElement);
        gui.open();
    }
};
