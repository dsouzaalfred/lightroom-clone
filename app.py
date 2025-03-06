from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from PIL import Image
import os
import cv2
import numpy as np
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        return jsonify({'filename': filename}), 200

@app.route('/edit', methods=['POST'])
def edit_image():
    data = request.json
    filename = data.get('filename')
    adjustments = data.get('adjustments', {})
    
    if not filename:
        return jsonify({'error': 'No filename provided'}), 400
    
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    
    try:
        # Load image using OpenCV
        img = cv2.imread(filepath)
        img = img.astype(np.float32) / 255.0  # Normalize to 0-1 range
        
        # Apply light adjustments
        if 'exposure' in adjustments:
            # Apply exposure adjustment
            exposure_value = adjustments['exposure']
            # Simple linear scaling for exposure
            img = np.clip(img * exposure_value, 0, 1)
        
        if any(key in adjustments for key in ['highlights', 'shadows', 'whites', 'blacks']):
            # Convert normalized image to uint8 for LAB conversion
            img_uint8 = (img * 255).astype(np.uint8)
            
            # Convert to LAB color space for better light adjustments
            lab = cv2.cvtColor(img_uint8, cv2.COLOR_BGR2LAB)
            L = lab[:,:,0].astype(np.float32)
            
            # Apply highlights adjustment
            if 'highlights' in adjustments:
                mask = (L > 127).astype(np.float32)
                # Map adjustment value to pixel adjustment
                adjustment = (adjustments['highlights'] - 1.0) * 50
                L = np.clip(L + adjustment * mask, 0, 255)
            
            # Apply shadows adjustment
            if 'shadows' in adjustments:
                mask = (L < 127).astype(np.float32)
                # Map adjustment value to pixel adjustment
                adjustment = (adjustments['shadows'] - 1.0) * 50
                L = np.clip(L + adjustment * mask, 0, 255)
            
            # Apply whites adjustment
            if 'whites' in adjustments:
                mask = (L > 230).astype(np.float32)
                # Map adjustment value to pixel adjustment
                adjustment = (adjustments['whites'] - 1.0) * 25
                L = np.clip(L + adjustment * mask, 0, 255)
            
            # Apply blacks adjustment
            if 'blacks' in adjustments:
                mask = (L < 25).astype(np.float32)
                # Map adjustment value to pixel adjustment
                adjustment = (adjustments['blacks'] - 1.0) * 25
                L = np.clip(L + adjustment * mask, 0, 255)
            
            # Ensure L channel stays in valid range
            L = np.clip(L, 0, 255)
            lab[:,:,0] = L.astype(np.uint8)
            
            # Convert back to BGR and normalize
            img = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR).astype(np.float32) / 255.0
        
        # Apply color adjustments
        if 'brightness' in adjustments:
            # Apply brightness adjustment
            brightness_value = adjustments['brightness']
            img = np.clip(img * brightness_value, 0, 1)
        
        if 'contrast' in adjustments:
            # Apply contrast adjustment
            contrast_value = adjustments['contrast']
            img = np.clip((img - 0.5) * contrast_value + 0.5, 0, 1)
        
        if 'saturation' in adjustments:
            # Apply saturation adjustment
            saturation_value = adjustments['saturation']
            img_uint8 = (img * 255).astype(np.uint8)
            hsv = cv2.cvtColor(img_uint8, cv2.COLOR_BGR2HSV)
            hsv = hsv.astype(np.float32)
            hsv[:,:,1] = np.clip(hsv[:,:,1] * saturation_value, 0, 255)
            hsv = hsv.astype(np.uint8)
            img = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR).astype(np.float32) / 255.0
        
        # Convert back to uint8 (0-255 range)
        img = np.clip(img * 255.0, 0, 255).astype(np.uint8)
        
        # Save edited image
        edited_filename = f'edited_{filename}'
        edited_filepath = os.path.join(app.config['UPLOAD_FOLDER'], edited_filename)
        cv2.imwrite(edited_filepath, img)
        
        return jsonify({'edited_filename': edited_filename}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/crop', methods=['POST'])
def crop_image():
    data = request.json
    filename = data.get('filename')
    crop_data = data.get('crop')
    
    if not filename or not crop_data:
        return jsonify({'error': 'Missing filename or crop data'}), 400
    
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    
    try:
        # Load image using OpenCV
        img = cv2.imread(filepath)
        
        # Extract crop coordinates
        x, y, width, height = int(crop_data['x']), int(crop_data['y']), int(crop_data['width']), int(crop_data['height'])
        
        # Ensure coordinates are within image bounds
        height_img, width_img = img.shape[:2]
        x = max(0, min(x, width_img - 1))
        y = max(0, min(y, height_img - 1))
        width = min(width, width_img - x)
        height = min(height, height_img - y)
        
        # Crop the image
        cropped_img = img[y:y+height, x:x+width]
        
        # Save cropped image
        cropped_filename = f'cropped_{filename}'
        cropped_filepath = os.path.join(app.config['UPLOAD_FOLDER'], cropped_filename)
        cv2.imwrite(cropped_filepath, cropped_img)
        
        return jsonify({'filename': cropped_filename}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    app.run(host='0.0.0.0', port=5003, debug=True)
