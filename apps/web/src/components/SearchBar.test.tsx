import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SearchBar } from './SearchBar';

function CurrentLocation(): JSX.Element {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe('SearchBar', () => {
  it('opens paper search with the query and default relevance sort', () => {
    render(
      <MemoryRouter initialEntries={['/app']}>
        <SearchBar roles={['STUDENT']} />
        <Routes>
          <Route path="*" element={<CurrentLocation />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search papers' }), { target: { value: 'CSC 201' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/app/papers?q=CSC+201&page=1&sort=relevance');
  });

  it('supports admin user search through the existing users endpoint route', () => {
    render(
      <MemoryRouter initialEntries={['/app']}>
        <SearchBar roles={['ADMIN']} />
        <Routes>
          <Route path="*" element={<CurrentLocation />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Search area' }), { target: { value: 'users' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search users' }), { target: { value: 'Amara' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/app/admin/users?q=Amara');
  });
});
