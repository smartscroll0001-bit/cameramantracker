import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_dev_secret_key_12345'; // Use env in production

export function verifyToken(req) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded; // { userId, role, iat, exp }
    } catch (error) {
        return null;
    }
}

export function requireAuth(req, res) {
    const user = verifyToken(req);
    if (!user) {
        res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing token' });
        return null;
    }
    return user;
}
