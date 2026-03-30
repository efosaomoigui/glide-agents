const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function getChatId() {
  console.log('--- TELEGRAM CHAT ID RETRIEVER ---');
  
  rl.question('Step 1: Paste Your Telegram Bot Token here: ', async (token) => {
    if (!token) {
      console.log('Error: Token is required.');
      process.exit(1);
    }

    console.log('\nStep 2: Message your bot ON YOUR PHONE now.');
    console.log('👉 Click "START" and send any message like "Hello GLIDE".');
    console.log('Searching for messages for the next 60 seconds...\n');
    
    let attempts = 0;
    const check = setInterval(async () => {
      attempts++;
      process.stdout.write(`\r🔍 Searching... (Attempt ${attempts}/12)`);
      
      try {
        const response = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`);
        const updates = response.data.result;

        if (updates.length > 0) {
          clearInterval(check);
          const latest = updates[updates.length - 1];
          const chatId = latest.message.chat.id;
          const name = latest.message.from.first_name;

          console.log('\n\n✅ FOUND IT!');
          console.log(`User: ${name}`);
          console.log(`CHAT_ID: ${chatId}`);
          console.log('\nAdd these to your .env file:');
          console.table({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId });
          rl.close();
        } else if (attempts >= 12) {
          clearInterval(check);
          console.log('\n\n❌ Still no messages found.');
          console.log('1. Make sure you clicked START on the bot.');
          console.log('2. Make sure you sent a text message.');
          console.log('Try running the script again.');
          rl.close();
        }
      } catch (err) {
        clearInterval(check);
        console.error('\n❌ Failed to fetch updates:', err.response?.data || err.message);
        rl.close();
      }
    }, 5000);
  });
}

getChatId();
