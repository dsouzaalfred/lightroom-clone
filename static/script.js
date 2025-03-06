document.addEventListener('DOMContentLoaded', () => {
    const uploadBtn = document.getElementById('uploadBtn');
    const imageUpload = document.getElementById('imageUpload');
    const imagePreview = document.getElementById('imagePreview');
    const resetBtn = document.getElementById('resetBtn');
    const cropBtn = document.getElementById('cropBtn');
    const cancelCropBtn = document.getElementById('cancelCropBtn');
    const aspectRatioSelect = document.getElementById('aspectRatio');
    const sliders = ['exposure', 'highlights', 'shadows', 'whites', 'blacks', 'brightness', 'contrast', 'saturation'].map(id => document.getElementById(id));
    
    let currentImage = null;
    let originalImage = null;
    let cropper = null;
    let isCropping = false;

    // Aspect ratio map
    const aspectRatios = {
        'free': NaN,
        '1:1': 1,
        '4:3': 4/3,
        '16:9': 16/9,
        '3:4': 3/4,
        '2:3': 2/3
    };
    
    // Handle image upload
    uploadBtn.addEventListener('click', () => {
        imageUpload.click();
    });
    
    imageUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            if (response.ok) {
                currentImage = data.filename;
                originalImage = data.filename;
                updateImagePreview(currentImage);
                resetAdjustments();
                // Show crop panel after image upload
                document.querySelector('.crop-panel').classList.remove('hidden');
            } else {
                alert('Error uploading image: ' + data.error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error uploading image');
        }
    });
    
    // Handle adjustments
    async function applyAdjustments(adjustments) {
        if (!currentImage || !adjustments) return;
        
        const img = imagePreview.querySelector('img');
        if (!img) return;
        
        // Add loading class to indicate adjustment in progress
        if (!img.classList.contains('adjusting')) {
            img.classList.add('adjusting');
        }
        
        try {
            const response = await fetch('/edit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: currentImage,
                    adjustments
                })
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to apply adjustments');
            }
            
            // Create a new Image object to preload
            const newImage = new Image();
            
            // Set up onload before setting src to ensure it catches
            newImage.onload = () => {
                requestAnimationFrame(() => {
                    img.src = newImage.src;
                    img.classList.remove('adjusting');
                    currentImage = data.edited_filename;
                });
            };
            
            // Add error handler
            newImage.onerror = () => {
                console.error('Failed to load adjusted image');
                img.classList.remove('adjusting');
            };
            
            // Add cache-busting and start loading
            newImage.src = `/uploads/${data.edited_filename}?t=${Date.now()}`;
        } catch (error) {
            console.error('Error:', error);
            img.classList.remove('adjusting');
        }
    }

    // Function to convert slider value to adjustment value
    function sliderToAdjustment(value, type) {
        // Convert -100 to 100 range to appropriate adjustment value
        const val = parseFloat(value);
        if (val === 0) return 1;  // Neutral value
        
        // Special handling for exposure
        if (type === 'exposure') {
            // For exposure: linear scaling
            // Positive values increase exposure (brighter)
            // Negative values decrease exposure (darker)
            const factor = val / 100;
            return factor >= 0 ? 1 + factor : 1 / (1 + Math.abs(factor));
        }
        
        // For other adjustments
        const factor = val / 100;
        return factor >= 0 ? 1 + factor : Math.max(0.2, 1 - Math.abs(factor));
    }

    // Function to check if all sliders are at neutral position
    function areAllSlidersNeutral() {
        return ['exposure', 'highlights', 'shadows', 'whites', 'blacks',
                'brightness', 'contrast', 'saturation'].every(id => {
            const slider = document.getElementById(id);
            return !slider || parseFloat(slider.value) === 0;
        });
    }

    // Function to update slider value display
    function updateSliderValue(id, value) {
        const valueDisplay = document.getElementById(`${id}-value`);
        if (valueDisplay) {
            valueDisplay.textContent = Math.round(value);
        }
    }

    // Add event listeners to sliders
    let updateTimer = null;
    let isAdjusting = false;
    
    sliders.forEach(slider => {
        if (!slider) return; // Skip if slider not found
        
        // Update initial value display
        updateSliderValue(slider.id, slider.value);
        
        slider.addEventListener('input', () => {
            // Update value display
            updateSliderValue(slider.id, slider.value);
            
            // Clear any existing timer
            if (updateTimer) clearTimeout(updateTimer);
            
            // Set a new timer to update after a short delay
            updateTimer = setTimeout(async () => {
                if (!currentImage) return;  // Don't apply if no image is loaded
                if (isAdjusting) return;    // Don't queue up adjustments
                
                try {
                    isAdjusting = true;
                    
                    // Get all current slider values
                    const currentAdjustments = {};
                    ['exposure', 'highlights', 'shadows', 'whites', 'blacks',
                     'brightness', 'contrast', 'saturation'].forEach(id => {
                        const slider = document.getElementById(id);
                        if (slider) {
                            const value = parseFloat(slider.value);
                            // Pass the adjustment type to handle exposure differently
                            currentAdjustments[id] = sliderToAdjustment(value, id);
                        }
                    });
                    
                    // Check if all adjustments are neutral
                    const allNeutral = Object.values(currentAdjustments).every(val => val === 1);
                    
                    if (allNeutral && originalImage) {
                        // If all adjustments are neutral, revert to original
                        currentImage = originalImage;
                        updateImagePreview(currentImage);
                    } else {
                        // Apply adjustments
                        await applyAdjustments(currentAdjustments);
                    }
                } catch (error) {
                    console.error('Error applying adjustments:', error);
                } finally {
                    isAdjusting = false;
                    // Remove loading class from image
                    const img = imagePreview.querySelector('img');
                    if (img) img.classList.remove('adjusting');
                }
            }, 50); // Quick response time
        });
    });
    
    // Reset adjustments
    resetBtn.addEventListener('click', () => {
        resetAdjustments();
    });
    
    function resetAdjustments() {
        if (!originalImage) return;
        
        // Reset all adjustments to default (0)
        ['exposure', 'highlights', 'shadows', 'whites', 'blacks',
         'brightness', 'contrast', 'saturation'].forEach(id => {
            const slider = document.getElementById(id);
            if (slider) {
                slider.value = 0;
                updateSliderValue(id, 0);
            }
        });
        
        // Revert to original image immediately
        if (areAllSlidersNeutral()) {
            currentImage = originalImage;
            updateImagePreview(currentImage);
        }
        
        // Reset cropper but keep crop panel visible
        if (cropper) {
            cropper.destroy();
            cropper = null;
            isCropping = false;
        }
    }
    
    function updateImagePreview(filename) {
        // Destroy existing cropper if it exists
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        if (filename) {
            let img = imagePreview.querySelector('img');
            if (!img) {
                // Create new image element only if it doesn't exist
                img = document.createElement('img');
                img.alt = 'Preview';
                img.style.opacity = '0';
                imagePreview.innerHTML = '';
                imagePreview.appendChild(img);
                
                // Add load event listener for smooth fade-in
                img.onload = () => {
                    img.style.transition = 'opacity 0.2s ease-in-out';
                    img.style.opacity = '1';
                };
            }
            
            // Preload the new image
            const newImage = new Image();
            newImage.onload = () => {
                img.src = newImage.src;
            };
            newImage.src = `/uploads/${filename}?t=${Date.now()}`;
            
            // Show crop panel when an image is loaded
            document.querySelector('.crop-panel').classList.remove('hidden');
        } else {
            imagePreview.innerHTML = `<p class="placeholder-text">Upload an image to start editing</p>`;
            document.querySelector('.crop-panel').classList.add('hidden');
        }
    }

    // Initialize cropping
    function initCropping() {
        if (!currentImage) return;
        isCropping = true;

        // Get the image element
        const image = imagePreview.querySelector('img');
        if (!image) return;

        // Initialize Cropper.js
        cropper = new Cropper(image, {
            viewMode: 1,
            aspectRatio: aspectRatios[aspectRatioSelect.value],
            autoCropArea: 1,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false
        });
    }

    // Apply crop
    async function applyCrop() {
        if (!cropper || !currentImage) return;

        try {
            // Get crop data
            const cropData = cropper.getData(true); // rounded values

            const response = await fetch('/crop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: currentImage,
                    crop: cropData
                })
            });

            const data = await response.json();
            if (response.ok) {
                updateImagePreview(data.filename);
                currentImage = data.filename;
                isCropping = false;
            } else {
                console.error('Error applying crop:', data.error);
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }

    // Cancel crop
    function cancelCrop() {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        updateImagePreview(currentImage);
        isCropping = false;
    }

    // Handle aspect ratio change
    aspectRatioSelect.addEventListener('change', () => {
        if (cropper) {
            cropper.setAspectRatio(aspectRatios[aspectRatioSelect.value]);
        } else {
            initCropping();
        }
    });

    // Add crop button event listeners
    cropBtn.addEventListener('click', applyCrop);
    cancelCropBtn.addEventListener('click', cancelCrop);

    // Add double-click handler to start cropping
    imagePreview.addEventListener('dblclick', (e) => {
        if (e.target.tagName === 'IMG' && !isCropping) {
            initCropping();
        }
    });
});
