import { initApp } from './src/ui/app.js';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');

initApp(root);
