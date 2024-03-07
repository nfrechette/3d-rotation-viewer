import { Viewer } from './viewer.js';

import WebGL from 'three/examples/jsm/capabilities/WebGL.js';

class App {
    constructor(el) {
        this.el = el;

        this.viewerParentEl = el.querySelector('.viewerParent');
        this.viewerEl = document.createElement('div');
        this.viewerEl.classList.add('viewer');
        this.viewerParentEl.innerHTML = '';
        this.viewerParentEl.appendChild(this.viewerEl);
        this.viewer = new Viewer(this.viewerEl);
    }
}

if (WebGL.isWebGLAvailable()) {
    document.addEventListener('DOMContentLoaded', () => {
        const app = new App(document.body);
    });
}
else {
    const warning = WebGL.getWebGLErrorMessage();
    document.querySelector('.viewerParent').appendChild(warning);

    console.error('WebGL is not supported in this browser.');
}
