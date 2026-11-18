import type { ElementDef } from '../battle/types';

// 属性は5つ。主人公2人（炎・雷）と仲間（氷・風）、あとから来るガチャのキャラ（影など）で散らす。
export const ELEMENTS: Record<string, ElementDef> = {
  fire: { id: 'fire', name: '炎', color: '#ff6a3d' },
  ice: { id: 'ice', name: '氷', color: '#6ad8ff' },
  thunder: { id: 'thunder', name: '雷', color: '#ffd84a' },
  wind: { id: 'wind', name: '風', color: '#5ef0a0' },
  shadow: { id: 'shadow', name: '影', color: '#a07cff' },
};
