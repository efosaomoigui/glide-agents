const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function runResearch() {
  const url = 'https://paperly.online/api/topics/trending?filter=today&page=1';
  console.log(`🔍 Researching latest intelligence from ${url}...`);
  
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (GLIDE Marketing Agent)' }
    });
    
    const items = response.data.items || [];
    const topStories = items.slice(0, 3); // Grab top 3 "slides"
    
    if (topStories.length === 0) {
      console.log('⚠️ No trending stories found.');
      return null;
    }

    let output = `# Web Research: paperly.online (Top 3 Stories)\n`;
    output += `**Last Updated**: ${new Date().toISOString()}\n`;
    output += `**Source API**: ${url}\n\n`;

    topStories.forEach((story, index) => {
      output += `## Story ${index + 1}: ${story.title}\n`;
      output += `${story.ai_brief || ''}\n\n`;
      
      if (story.bullets && story.bullets.length > 0) {
        output += `### Key Intelligence Points:\n`;
        story.bullets.forEach(point => {
          output += `- ${point}\n`;
        });
        output += `\n`;
      }

      if (story.wyntk) {
        output += `### What You Need To Know:\n${story.wyntk}\n\n`;
      }
      
      output += `---\n\n`;
    });

    output += `*This research data is automatically used by GLIDE to inform content creation.*`;
    
    const memDir = path.join(__dirname, '../memory');
    if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
    
    fs.writeFileSync(path.join(memDir, 'research-data.md'), output);
    console.log(`✅ Research completed. Captured ${topStories.length} stories.`);
    return topStories;
  } catch (err) {
    console.error('❌ Research failed:', err.message);
    throw err;
  }
}

if (require.main === module) {
  runResearch().then(() => console.log('✅ Done')).catch(console.error);
}

module.exports = { runResearch };
