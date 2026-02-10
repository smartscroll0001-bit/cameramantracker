import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KPIBadge } from './KPIBadge';
import React from 'react';

describe('KPIBadge', () => {
    it('renders "Underperforming" for hours < 7', () => {
        render(<KPIBadge hours={6} />);
        expect(screen.getByText('Underperforming')).toBeInTheDocument();
        expect(screen.getByText('Underperforming').parentElement).toHaveClass('badge-red');
    });

    it('renders "Normal" for hours = 7', () => {
        render(<KPIBadge hours={7} />);
        expect(screen.getByText('Normal')).toBeInTheDocument();
        expect(screen.getByText('Normal').parentElement).toHaveClass('badge-amber');
    });

    it('renders "Normal" for hours = 7.5', () => {
        render(<KPIBadge hours={7.5} />);
        expect(screen.getByText('Normal')).toBeInTheDocument();
        expect(screen.getByText('Normal').parentElement).toHaveClass('badge-amber');
    });

    it('renders "Overperforming" for hours > 7.5', () => {
        render(<KPIBadge hours={8} />);
        expect(screen.getByText('Overperforming')).toBeInTheDocument();
        expect(screen.getByText('Overperforming').parentElement).toHaveClass('badge-green');
    });

    it('renders correctly with statusOverride "On Leave"', () => {
        render(<KPIBadge hours={8} status="On Leave" />);
        expect(screen.getByText('On Leave')).toBeInTheDocument();
        expect(screen.getByText('On Leave').parentElement).toHaveClass('badge-blue');
    });

    // This test documents the bug: undefined hours currently returns "Overperforming" because of the else block.
    // If I fix it, I expect it to either return "Underperforming" (treat as 0) or handle it gracefully.
    // For now, let's just assert what happens currently to prove the bug exists?
    // Or assert what SHOULD happen?
    // The prompt says "check for issues make tests". I should probably make a test that fails if the code is buggy, or passes if the code is correct (but currently fails).
    // I'll write the test for the EXPECTED behavior: undefined hours should probably be treated as 0 (Underperforming) or N/A.
    // Given the context of "Underperforming < 7", 0 or undefined is definitely < 7.
    // So it should be Underperforming.
    // But currently: undefined < 7 is false. undefined <= 7.5 is false. so it goes to else -> Overperforming.

    it('handles undefined hours correctly (should be Underperforming or N/A, not Overperforming)', () => {
        render(<KPIBadge hours={undefined} />);

        // This is what it currently does (BUG):
        // expect(screen.getByText('Overperforming')).toBeInTheDocument();

        // This is what it SHOULD do (FIX):
        // Let's assume we want it to be 'Underperforming' (treating missing hours as 0 hours worked)
        expect(screen.getByText('Underperforming')).toBeInTheDocument();
    });
});
