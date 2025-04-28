# BookSlicer

### [Live demo here!](https://malcolmocean.github.io/bookslicer/)

A browser-based tool for extracting chapters from EPUB books and preparing them for use as LLM context. Works entirely in the browser - no server required!

## Features

- Drag and drop EPUB file upload
- Display chapter list with token estimates (4 characters = 1 token)
- Select specific chapters to extract
- Strip HTML/XML formatting
- Copy extracted text to clipboard
- Download extracted text as a file

## Usage

1. Simply open `index.html` in your browser or host the files on GitHub Pages
2. Drag and drop an EPUB file or click to select one
3. Select the chapters you want to extract
4. Click "Extract Selected Chapters"
5. Copy the text or download it as a file

## Dependencies

The app uses these CDN-hosted libraries:
- epub.js - For parsing EPUB files
- jszip - Required by epub.js for handling EPUB archives

## Hosting

This app works entirely in the browser and can be hosted on GitHub Pages or any static file host. No build step or server required!
