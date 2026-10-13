import { fireEvent, screen } from '@testing-library/react'

/** Presses each menu item along the path, opening the submenus on the way, as a pointer would. */
export function pickMenuItem(...path: string[]) {
  for (const name of path) {
    fireEvent.click(screen.getByRole('menuitem', { name }))
  }
}

/** The labels of the open menus' items, submenus included. */
export function menuItemLabels() {
  return screen.getAllByRole('menuitem').map((item) => item.textContent)
}
