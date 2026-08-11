/**
 * The landing page renders, and its chips come from the real parser.
 *
 * This is the check the old page could not have: its chips were a fixture, so
 * nothing could disagree with them. Here the page is mounted, the parser it
 * imports on demand is the app's own, and the assertions are about what that
 * parser produced. A chip labelled "list" or a `!high` priority would fail,
 * because the parser has neither.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Welcome from '../Welcome';
import { SHOWCASE_SENTENCES } from '../welcomeSentences';

const renderPage = () =>
  render(
    <MemoryRouter>
      <Welcome />
    </MemoryRouter>
  );

describe('the landing page', () => {
  it('renders without the parser having resolved yet', () => {
    renderPage();

    expect(screen.getByText(/one sentence, three beats/i)).toBeInTheDocument();
    // Nothing is claimed before the parse lands.
    expect(screen.queryByText('list')).not.toBeInTheDocument();
  });

  it('fills the showcase from the real parse of its first sentence', async () => {
    renderPage();

    expect(SHOWCASE_SENTENCES[0]).toBe('Coffee with Priya thursday 10am');
    // The title appears on the chip and again on the card it files.
    expect(
      await screen.findAllByText('Coffee with Priya', {}, { timeout: 5000 })
    ).not.toHaveLength(0);
    expect(screen.getByText('Thursday at 10:00 AM')).toBeInTheDocument();
    // The field names are the parser's, and it has no notion of a list.
    expect(screen.getAllByText('tag').length).toBeGreaterThan(0);
    expect(screen.queryByText('list')).not.toBeInTheDocument();
  });

  it('never shows the priority syntax the parser does not have', async () => {
    const { container } = renderPage();

    await screen.findAllByText('Coffee with Priya', {}, { timeout: 5000 });
    expect(container.textContent).not.toContain('!high');
  });
});
