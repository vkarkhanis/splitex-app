jest.mock('next/link', () => {
  return ({ children, href, ...rest }: any) => {
    const React = require('react');
    return React.createElement('a', { href, ...rest }, children);
  };
});
