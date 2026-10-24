// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chat } from './components/Chat';

const props = {
  messages: [],
  busy: false,
  onSend: vi.fn(),
  onSuggest: vi.fn(),
  routeNote: null,
};

beforeEach(() => {
  vi.stubGlobal('scrollIntoView', vi.fn());
  HTMLElement.prototype.scrollIntoView = vi.fn();
  props.onSend.mockReset();
  props.onSuggest.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Chat interaction', () => {
  it('shows starter suggestions and forwards a selected prompt', () => {
    render(<Chat {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /صفحة تسجيل/ }));
    expect(props.onSuggest).toHaveBeenCalledWith('ابنِ صفحة تسجيل المستخدمين مع تحقق الحقول واختبارات');
  });

  it('trims and submits the typed prompt on Enter, then clears the input', () => {
    render(<Chat {...props} />);
    const input = screen.getByPlaceholderText(/صف ما تريد إنجازه/);
    fireEvent.change(input, { target: { value: '  راجع الاختبارات  ' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    expect(props.onSend).toHaveBeenCalledWith('راجع الاختبارات');
    expect(input).toHaveProperty('value', '');
  });

  it('does not submit blank input or submit while busy', () => {
    const { rerender } = render(<Chat {...props} />);
    const input = screen.getByPlaceholderText(/صف ما تريد إنجازه/);
    const send = input.parentElement!.querySelector('button')!;
    fireEvent.click(send);
    expect(props.onSend).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'do work' } });
    rerender(<Chat {...props} busy messages={[{ id: 'm1', role: 'user', content: 'do work', time: '12:00' }]} />);
    expect(screen.getByText('Celia تعمل على المهمة…')).toBeTruthy();
    const sendWhileBusy = screen.getByPlaceholderText(/صف ما تريد إنجازه/).parentElement!.querySelector('button')!;
    expect(sendWhileBusy.disabled).toBe(true);
    fireEvent.keyDown(screen.getByPlaceholderText(/صف ما تريد إنجازه/), { key: 'Enter', shiftKey: false });
    expect(props.onSend).not.toHaveBeenCalled();
  });
});
