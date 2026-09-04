import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../lib/redits";

// Helper function to safely create RedisStore with fallback to memory store
const createRedisStore = () => {
	try {
		// Check if Redis is connected
		if (redisClient.isOpen) {
			return new RedisStore({
				sendCommand: (...args: string[]) => redisClient.sendCommand(args),
			});
		}
		// If Redis not connected, return undefined to use default memory store
		console.warn('Redis not connected for rate limiter, using memory store as fallback');
		return undefined;
	} catch (error) {
		console.warn('Failed to create Redis store for rate limiter, using memory store:', error);
		return undefined;
	}
};

// General limiter - for most routes (100 requests per 15 minutes)
export const generalLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100,
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
	// Will use Redis if connected, otherwise falls back to memory store
	store: createRedisStore(),
	message: {
		success: false,
		message: "Too many requests from this IP, please try again later.",
	},
});

// Strict limiter - for sensitive routes like login, register, forgot-password (5 requests per 15 minutes)
export const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 5,
	standardHeaders: true,
	legacyHeaders: false,
	skipSuccessfulRequests: false, // Count all attempts, even successful ones
	store: createRedisStore(),
	message: {
		success: false,
		message: "Too many authentication attempts from this IP, please try again after 15 minutes.",
	},
});

// Payment limiter - for payment-related routes (10 requests per 15 minutes)
export const paymentLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 10,
	standardHeaders: true,
	legacyHeaders: false,
	store: createRedisStore(),
	message: {
		success: false,
		message: "Too many payment requests, please try again later.",
	},
});

// File upload limiter - for file upload routes (20 requests per hour)
export const uploadLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 20,
	standardHeaders: true,
	legacyHeaders: false,
	store: createRedisStore(),
	message: {
		success: false,
		message: "Too many file uploads, please try again later.",
	},
});
