document.addEventListener('DOMContentLoaded', () => {
    const uploadBtn = document.getElementById('uploadBtn');
    const imageUpload = document.getElementById('imageUpload');
    const imagePreview = document.getElementById('imagePreview');
    const resetBtn = document.getElementById('resetBtn');
    const sliders = ['brightness', 'contrast', 'saturation'].map(id => document.getElementById(id));
    
    let currentImage = null;
    let originalImage = null;
    let updateTimer = null;
    
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
            } else {
                alert('Error uploading image: ' + data.error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error uploading image');
        }
    });
    
    // Handle adjustments
    async function applyAdjustments() {
        if (!currentImage) return;
        
        const adjustments = {
            brightness: parseFloat(document.getElementById('brightness').value),
            contrast: parseFloat(document.getElementById('contrast').value),
            saturation: parseFloat(document.getElementById('saturation').value)
        };
        
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
            if (response.ok) {
                updateImagePreview(data.edited_filename);
                currentImage = data.edited_filename;
            } else {
                console.error('Error applying adjustments:', data.error);
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }

    // Add event listeners to sliders
    sliders.forEach(slider => {
        slider.addEventListener('input', () => {
            // Clear the previous timer
            if (updateTimer) {
                clearTimeout(updateTimer);
            }
            
            // Set a new timer to update after a short delay
            updateTimer = setTimeout(() => {
                applyAdjustments();
            }, 150); // Delay of 150ms to prevent too many requests
        });
    });
    
    // Reset adjustments
    resetBtn.addEventListener('click', () => {
        resetAdjustments();
    });
    
    function resetAdjustments() {
        document.getElementById('brightness').value = 1;
        document.getElementById('contrast').value = 1;
        document.getElementById('saturation').value = 1;
        
        if (originalImage) {
            currentImage = originalImage;
            updateImagePreview(currentImage);
        }
    }
    
    function updateImagePreview(filename) {
        imagePreview.innerHTML = `<img src="/uploads/${filename}" alt="Preview">`;
    }
});
