import { Request, Response, NextFunction } from 'express';
import { verifySessionToken } from './firebase-admin.ts';
import { store } from './store.ts';
import { UserProfile } from '../types/domain.ts';

export interface AuthRequest extends Request {
  userProfile?: UserProfile;
}

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await verifySessionToken(token);
    const email = decoded.email || `${decoded.uid}@student.primeprep.in`;
    const profile = store.upsertUser(decoded.uid, email, decoded.name);
    if (profile.account_status === 'active') {
      req.userProfile = profile;
    }
  } catch (_err) {
    // Ignore invalid optional token
  }
  next();
};

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    return;
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await verifySessionToken(token);
    const email = decoded.email || `${decoded.uid}@student.primeprep.in`;
    const profile = store.upsertUser(decoded.uid, email, decoded.name);
    if (profile.account_status === 'suspended') {
      res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
      return;
    }
    req.userProfile = profile;
    next();
  } catch (_error) {
    res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  await requireAuth(req, res, () => {
    if (!req.userProfile || req.userProfile.role !== 'admin') {
      res.status(403).json({ error: 'Administrator privileges required for this operation.' });
      return;
    }
    next();
  });
};
