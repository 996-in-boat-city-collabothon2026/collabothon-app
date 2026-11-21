// Saved chats with the agents (Pair 1, Nara). Kept on THIS device only (localStorage), like comfort mode:
// no server change, nothing shared between devices. A meeting becomes a chat you can continue later.
import type { CfoId } from '@cfo/shared';

export interface ChatMsg {
  from: 'me' | 'cfo' | 'chair';
  cfo?: CfoId;
  text: string;
}
export interface Chat {
  id: string;
  title: string;
  kind: 'meeting' | 'chat';
  updatedAt: number;
  messages: ChatMsg[];
}

const KEY = 'mani-chats';
const MAX_CHATS = 30;

/** All saved chats, newest first. Blocked storage or a broken value just gives an empty list. */
export function listChats(): Chat[] {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Chat[];
    return Array.isArray(data) ? data.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

export function getChat(id: string): Chat | undefined {
  return listChats().find((c) => c.id === id);
}

/** Saves (adds or replaces) a chat and keeps only the newest MAX_CHATS. */
export function saveChat(chat: Chat): void {
  const rest = listChats().filter((c) => c.id !== chat.id);
  try {
    localStorage.setItem(KEY, JSON.stringify([{ ...chat, updatedAt: Date.now() }, ...rest].slice(0, MAX_CHATS)));
  } catch {
    /* storage blocked: the chat still works until the page is closed */
  }
}

export function deleteChat(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(listChats().filter((c) => c.id !== id)));
  } catch {
    /* ignore */
  }
}

export function newChat(title: string, kind: Chat['kind'], messages: ChatMsg[] = []): Chat {
  return { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title, kind, updatedAt: Date.now(), messages };
}
