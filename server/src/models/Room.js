import mongoose from 'mongoose';
import { DEFAULT_LANGUAGE } from '../config/languages.js';

/**
 * One document per room. This is the entire persistence layer: last-write-wins
 * means we only ever need the newest snapshot of the buffer, never a history.
 */
const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    code: {
      type: String,
      default: '',
    },
    language: {
      type: String,
      default: DEFAULT_LANGUAGE,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  // `timestamps` is off on purpose — the spec asks for exactly these four
  // fields, and we set `updatedAt` ourselves on every debounced save.
  { versionKey: false }
);

export const Room = mongoose.model('Room', roomSchema);
