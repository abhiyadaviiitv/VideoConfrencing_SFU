import dotenv from 'dotenv'
import path from 'path'

// Explicitly load .env from current directory
console.log('Loading .env...')
const result = dotenv.config()

if (result.error) {
    console.error('Error loading .env:', result.error)
} else {
    console.log('Dotenv loaded successfully')
}

console.log('Environment Check:')
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET)
console.log('LEARNSPHERE_JWT_SECRET exists:', !!process.env.LEARNSPHERE_JWT_SECRET)
if (process.env.LEARNSPHERE_JWT_SECRET) {
    console.log('LEARNSPHERE_JWT_SECRET length:', process.env.LEARNSPHERE_JWT_SECRET.length)
    console.log('LEARNSPHERE_JWT_SECRET start:', process.env.LEARNSPHERE_JWT_SECRET.substring(0, 5))
}
console.log('Total keys:', Object.keys(process.env).length)
