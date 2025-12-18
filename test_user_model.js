import dotenv from 'dotenv';
import { User } from './models/User.js';

dotenv.config();

console.log('Testing User model...');

const test = async () => {
    try {
        console.log('Connecting to DB...');
        // Try to find a user (any select query)
        const user = await User.findByEmail('test@example.com');
        console.log('Query success. Result:', user);
        console.log('DB Connection OK');
        process.exit(0);
    } catch (error) {
        console.error('DB Connection Failed:', error);
        process.exit(1);
    }
};

test();
