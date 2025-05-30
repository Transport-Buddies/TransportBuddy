// This file is the entry point for the React application, for now it just renders the App component
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// aSBtYWRlIHRoaXMgcHJvamVjdCBiZWNhdXNlIGkgd2FudGVkIGEgcmVhc29uIHRvIHNwZW5kIHRpbWUgd2l0aCB5b3UuIEknbSBzb3JyeSwgaSBjYW4ndCBzYXkgdGhpcyBmcmVlbHkgYW5kIGZvciBmZWVsaW5nIHRoZSB3YXkgdGhhdCBpIGRvIGFib3V0IHlvdS4gVGhhbmsgeW91IGZvciBiZWluZyB5b3UgYW5kIGZvciBiZWluZyBpbiBteSBsaWZlLg==