import { describe, expect, it } from 'vitest';
import { DEV_SAVE_KEY, SAVE_KEY, defaultSave, loadSave, storeSave } from './save';

/** ためし用の保存場所 */
function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

describe('開発用モードの保存', () => {
  it('開発用の保存は、ふつうの保存と別の場所。開発用で変えても、ふつうの進み具合はそのまま', () => {
    const st = memStorage();
    const normal = defaultSave();
    normal.items.stone = 160;
    storeSave(st, normal);
    const dev = loadSave(st, DEV_SAVE_KEY).save;
    expect(dev.items.stone).not.toBe(160); // 開発用は別（まだ無いので、はじめから）
    dev.items.stone = 99999;
    storeSave(st, dev, DEV_SAVE_KEY);
    expect(loadSave(st).save.items.stone).toBe(160);
    expect(loadSave(st, DEV_SAVE_KEY).save.items.stone).toBe(99999);
    expect(st.getItem(SAVE_KEY)).not.toBe(st.getItem(DEV_SAVE_KEY));
  });
});
