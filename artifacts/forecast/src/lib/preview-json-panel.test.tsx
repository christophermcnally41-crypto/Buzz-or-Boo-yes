import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PreviewJsonPanel } from './preview-json-panel';

// ---------------------------------------------------------------------------
// Clipboard mock
// ---------------------------------------------------------------------------

const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    writable: true,
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// Helper: open the <details> element (jsdom does not toggle it on click)
// ---------------------------------------------------------------------------

function openDetails(container: HTMLElement) {
  const details = container.querySelector('details');
  if (!details) throw new Error('<details> not found');
  details.setAttribute('open', '');
}

// ---------------------------------------------------------------------------
// Visibility — button is inside the closed <details>
// ---------------------------------------------------------------------------

describe('PreviewJsonPanel — <details> state', () => {
  const sampleJson = JSON.stringify({ contenders: [{ key: 'A', name: 'Flour Bakery' }] }, null, 2);

  it('renders the <details> element closed by default', () => {
    const { container } = render(<PreviewJsonPanel json={sampleJson} />);
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details!.hasAttribute('open')).toBe(false);
  });

  it('renders the summary toggle with "Preview JSON" label', () => {
    render(<PreviewJsonPanel json={sampleJson} />);
    expect(screen.getByText('Preview JSON')).toBeInTheDocument();
  });

  it('Copy button lives inside the <details> content, not the <summary>', () => {
    // jsdom does not apply the CSS that hides <details> content when closed,
    // so we verify structural containment instead: the button must be a
    // descendant of <details> but NOT of <summary>.  In a real browser this
    // guarantees the button is invisible — and therefore unreachable — whenever
    // the disclosure is in its closed (default) state.
    const { container } = render(<PreviewJsonPanel json={sampleJson} />);
    const details  = container.querySelector('details')!;
    const summary  = details.querySelector('summary')!;
    const copyBtn  = container.querySelector('button[title="Copy JSON"]')!;

    // Button is inside <details>
    expect(details.contains(copyBtn)).toBe(true);
    // Button is NOT inside <summary>
    expect(summary.contains(copyBtn)).toBe(false);
  });

  it('Copy button is accessible once <details> is open', () => {
    const { container } = render(<PreviewJsonPanel json={sampleJson} />);
    openDetails(container);
    expect(screen.getByRole('button', { name: /copy json/i })).toBeInTheDocument();
  });

  it('JSON <pre> content is visible once <details> is open', () => {
    const { container } = render(<PreviewJsonPanel json={sampleJson} />);
    openDetails(container);
    const pre = screen.getByTestId('preview-json-pre');
    expect(pre).toHaveTextContent('"key": "A"');
  });
});

// ---------------------------------------------------------------------------
// Copy button — MULTI_CHOICE JSON
// ---------------------------------------------------------------------------

describe('PreviewJsonPanel — Copy button (MULTI_CHOICE JSON)', () => {
  const multiChoiceJson = JSON.stringify(
    {
      contenders: [
        { key: 'A', name: 'Flour Bakery', venue: 'South End' },
        { key: 'B', name: 'Clear Flour' },
      ],
      metric: 'Google review count',
      period: 'September 2026',
    },
    null,
    2,
  );

  it('calls navigator.clipboard.writeText with the exact JSON when clicked', async () => {
    const { container } = render(<PreviewJsonPanel json={multiChoiceJson} />);
    openDetails(container);
    const btn = screen.getByRole('button', { name: /copy json/i });
    await act(async () => { fireEvent.click(btn); });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(multiChoiceJson);
  });

  it('shows "Copied!" label immediately after clicking', async () => {
    vi.useFakeTimers();
    const { container } = render(<PreviewJsonPanel json={multiChoiceJson} />);
    openDetails(container);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /copy json/i })); });
    expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('reverts to "Copy" label after 2 seconds', async () => {
    vi.useFakeTimers();
    const { container } = render(<PreviewJsonPanel json={multiChoiceJson} />);
    openDetails(container);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /copy json/i })); });
    expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(2001); });
    expect(screen.getByRole('button', { name: /copy json/i })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('copied text round-trips correctly as JSON', async () => {
    const { container } = render(<PreviewJsonPanel json={multiChoiceJson} />);
    openDetails(container);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /copy json/i })); });
    const written = writeText.mock.calls[0][0] as string;
    const parsed = JSON.parse(written);
    expect(parsed.contenders).toHaveLength(2);
    expect(parsed.contenders[0].venue).toBe('South End');
    expect(parsed.metric).toBe('Google review count');
  });
});

// ---------------------------------------------------------------------------
// Copy button — THE_CALL JSON
// ---------------------------------------------------------------------------

describe('PreviewJsonPanel — Copy button (THE_CALL JSON)', () => {
  const theCallJson = JSON.stringify(
    {
      options: [
        { key: 'A', label: 'Yes, definitely' },
        { key: 'B', label: 'No way' },
      ],
      context: 'Best for weekly grocery run',
    },
    null,
    2,
  );

  it('calls navigator.clipboard.writeText with the exact JSON when clicked', async () => {
    const { container } = render(<PreviewJsonPanel json={theCallJson} />);
    openDetails(container);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /copy json/i })); });
    expect(writeText).toHaveBeenCalledWith(theCallJson);
  });

  it('copied text round-trips correctly as JSON', async () => {
    const { container } = render(<PreviewJsonPanel json={theCallJson} />);
    openDetails(container);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /copy json/i })); });
    const parsed = JSON.parse(writeText.mock.calls[0][0] as string);
    expect(parsed.options).toHaveLength(2);
    expect(parsed.options[0].label).toBe('Yes, definitely');
    expect(parsed.context).toBe('Best for weekly grocery run');
  });
});
