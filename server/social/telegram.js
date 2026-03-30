const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Formats a message for Telegram HTML mode, cleaning up markdown symbols
 * and improving spacing/structure.
 */
function formatMessageForTelegram(text) {
  if (!text) return '';

  let formatted = text;

  // 1. Handle Markdown Tables (Convert to vertical list)
  // This regex looks for table rows like | col 1 | col 2 |
  const tableRows = formatted.match(/^\|[\s\S]*?\|$/gm);
  if (tableRows && tableRows.length >= 3) {
    const headers = tableRows[0].split('|').map(s => s.trim()).filter(s => s);
    // Skip row 1 (separator like | :--- | :--- |)
    const dataRows = tableRows.slice(2);
    
    let tableReplacement = '\n';
    dataRows.forEach(row => {
      const cells = row.split('|').map(s => s.trim()).filter(s => s);
      headers.forEach((header, i) => {
        if (cells[i]) {
          tableReplacement += `<b>${header}:</b> ${cells[i]}\n`;
        }
      });
      tableReplacement += '\n';
    });
    
    // Replace the entire table block with our new format
    const startIdx = formatted.indexOf(tableRows[0]);
    const lastRow = tableRows[tableRows.length - 1];
    const endIdx = formatted.indexOf(lastRow) + lastRow.length;
    formatted = formatted.substring(0, startIdx) + tableReplacement + formatted.substring(endIdx);
  }

  // 2. Format Headers (### Header)
  formatted = formatted.replace(/^### (.*$)/gm, '<b>💠 $1</b>');
  formatted = formatted.replace(/^## (.*$)/gm, '<b>🔷 $1</b>');
  formatted = formatted.replace(/^# (.*$)/gm, '<b>👑 $1</b>');

  // 3. Clean up Bullet Points (* Strategy: -> • Strategy:)
  // Do this BEFORE italics/bold to avoid star confusion
  formatted = formatted.replace(/^\s*[\*\-]\s+/gm, '• ');

  // 4. Clean up Bold/Italics (replace **text** with <b>text</b>)
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  formatted = formatted.replace(/__(.*?)__/g, '<b>$1</b>');
  formatted = formatted.replace(/\*(.*?)\*/g, '<i>$1</i>');
  formatted = formatted.replace(/_(.*?)_/g, '<i>$1</i>');

  // 5. Enhance Labelled Items (e.g., • Strategy: -> • <b>Strategy:</b>)
  // This helps make the "clean font" look more structured. 
  // We handle potential <i> tags from step 4.
  const labels = 'Strategy|Platform|Hook|Body|CTA|Status|Caption|Strategy|Hook';
  const labelRegex = new RegExp(`(• |^)(<i>)?(${labels}):(</i>)?`, 'gim');
  formatted = formatted.replace(labelRegex, '$1<b>$3:</b>');

  // 6. Final cleanup: Remove excessive symbols and fix spacing
  formatted = formatted.replace(/\n{3,}/g, '\n\n'); // Max 2 newlines
  
  return formatted.trim();
}

/**
 * Sends a message to the owner via Telegram
 */
async function sendTelegramMessage(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram credentials not configured.');
    return;
  }

  // Format the text for a clean Telegram look
  const cleanText = formatMessageForTelegram(text);

  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: String(TELEGRAM_CHAT_ID),
      text: String(cleanText),
      parse_mode: 'HTML'
    }, {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
    return true;
  } catch (err) {
    // If HTML fails, try sending as plain text as a fallback (escaping HTML)
    try {
      const escapedText = cleanText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: escapedText
      });
      return true;
    } catch (retryErr) {
      console.error('❌ Telegram send failed (even plain text):', retryErr.response?.data || retryErr.message);
      return false;
    }
  }
}

/**
 * Tests the Telegram connection
 */
async function testTelegramConnection() {
  return await sendTelegramMessage('🤖 <b>GLIDE Status Check</b>: Telegram connection established. I am ready to work!');
}

module.exports = { sendTelegramMessage, testTelegramConnection };
