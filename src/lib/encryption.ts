
import CryptoJS from 'crypto-js';

const SECRET_KEY = process.env.ENCRYPTION_KEY || '';

if (!SECRET_KEY) {
    console.error('ENCRYPTION_KEY environment variable is not set');
}

export const encrypt = (data: any): string => {
    if (!SECRET_KEY) {
        throw new Error('Encryption key is not configured');
    }
    return CryptoJS.AES.encrypt(JSON.stringify(data), SECRET_KEY).toString();
};

export const decrypt = (ciphertext: string): any => {
    try {
        if (!SECRET_KEY) {
            console.error('Decryption failed: ENCRYPTION_KEY not set');
            return null;
        }
        
        if (!ciphertext || typeof ciphertext !== 'string') {
            console.error('Decryption failed: Invalid ciphertext');
            return null;
        }
        
        const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
        const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
        
        // Check if decryption produced empty string (wrong key or corrupted data)
        if (!decryptedData || decryptedData.trim() === '') {
            console.error('Decryption failed: Empty result (wrong key or corrupted data)');
            return null;
        }
        
        return JSON.parse(decryptedData);
    } catch (error) {
        console.error('Decryption failed:', error);
        return null;
    }
};
