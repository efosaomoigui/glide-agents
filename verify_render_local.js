const path = require('path');
const renderer = require('./server/render/renderer');

async function testRenderLocal() {
    console.log('🚀 Testing Renderer with Local Absolute Path...');
    
    // We'll use the Peter Obi image since it exists
    const localImgName = '1775015091448-peter obi.webp';
    const absolutePath = path.join(__dirname, 'data/local-images', localImgName);
    
    console.log(`🖼️ Local Image Path: ${absolutePath}`);
    
    const mockData = {
        headline: "TEST LOCAL RENDER SUCCESS",
        summary: "This post confirms that local image attachment is WORKING.",
        sector: "POLITICS",
        sources: "Intelligence Verification",
        image_url: absolutePath
    };
    
    try {
        console.log('🎨 Starting render...');
        const filename = await renderer.renderSinglePost(mockData, 1);
        console.log(`✅ Render complete! Filename: ${filename}`);
        const fullOutputPath = path.join(__dirname, 'data/output', filename);
        console.log(`📁 Saved to: ${fullOutputPath}`);
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Render failed:', err.message);
        process.exit(1);
    }
}

testRenderLocal().catch(console.error);
