import { describe, expect, it } from 'vitest';
import { fixParticles } from '@/core/i18n';

describe('fixParticles', () => {
  it('picks the particle by the final consonant of the word before it', () => {
    expect(fixParticles('주방을(를) 클리어하면 열려요.')).toBe('주방을 클리어하면 열려요.');
    expect(fixParticles('욕조을(를) 클리어하면 열려요.')).toBe('욕조를 클리어하면 열려요.');
    expect(fixParticles('검사냥이(가) 3레벨이 됐어요!')).toBe('검사냥이 3레벨이 됐어요!');
    expect(fixParticles('복고양이이(가) 열렸어요!')).toBe('복고양이가 열렸어요!');
    expect(fixParticles('미션은(는) 매일 바뀌어요')).toBe('미션은 매일 바뀌어요');
    expect(fixParticles('상자와(과) 열쇠')).toBe('상자와 열쇠');
  });

  it('treats a final ㄹ as open for (으)로', () => {
    expect(fixParticles('거실(으)로 가요')).toBe('거실로 가요');
    expect(fixParticles('주방(으)로 가요')).toBe('주방으로 가요');
    expect(fixParticles('마당(으)로')).toBe('마당으로');
    expect(fixParticles('욕조(으)로')).toBe('욕조로');
  });

  it('reads digits aloud and leaves other text alone', () => {
    expect(fixParticles('챕터 3을(를) 깼어요')).toBe('챕터 3을 깼어요');
    expect(fixParticles('챕터 2을(를) 깼어요')).toBe('챕터 2를 깼어요');
    expect(fixParticles('Chapter A을(를)')).toBe('Chapter A을(를)');
    expect(fixParticles('no particles here')).toBe('no particles here');
  });
});
