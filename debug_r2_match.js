const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const s3Config = () => {
    const {
        CLOUDFLARE_ACCOUNT_ID,
        R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY
    } = process.env;

    if (!CLOUDFLARE_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;

    return new S3Client({
        region: 'auto',
        endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        }
    });
};

async function checkBucket(keyword) {
    const s3 = s3Config();
    const bucket = process.env.R2_BUCKET_NAME2 || 'glidebucket';
    
    if (!s3) {
        console.log('No S3 config');
        return;
    }

    try {
        const data = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
        const files = (data.Contents || []).map(c => c.Key);
        
        console.log(`Files in bucket ${bucket}:`, files.length);
        
        const searchTerms = keyword.toLowerCase().split(/[^\w\d]+/).filter(t => t.length > 2);
        console.log('Searching for:', searchTerms);

        const results = files.map(file => {
            const fileNameLower = file.toLowerCase();
            let score = 0;
            for (const term of searchTerms) {
                if (fileNameLower.includes(term)) {
                    score++;
                    const wordRegex = new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`, 'i');
                    if (wordRegex.test(fileNameLower)) score += 1.0;
                }
            }
            return { file, score };
        }).filter(r => r.score >= 2.0).sort((a, b) => b.score - a.score);

        console.log('Top matches:');
        console.log(results.slice(0, 10));
    } catch (err) {
        console.error(err);
    }
}

const keyword = process.argv[2] || 'Naira';
checkBucket(keyword);
