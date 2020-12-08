const path = require('path');
const fs = require('fs');
const findComponentsForMock = require('./find_mocks');

const mockCompoennts = (components, currentPath) => {
  try {
    const allowedMocks = components.reduce((mocks, component) => {
      if (!mocks[component.path]) mocks[component.path] = [];
      mocks[component.path].push({ identifier: component.identifier, type: component.type });
      return mocks;
    }, {});

    const currentDirPath = path.dirname(currentPath);
    const AutoMockComponent = (props) => (props || {}).children || null;

    for (const componentPath of Object.keys(allowedMocks)) {
      const mockPath = componentPath.startsWith('.') ? path.join(currentDirPath, componentPath) : componentPath;
      jest.doMock(mockPath, () => {
        let mockedModule = { ...jest.requireActual(mockPath) };
        Object.defineProperty(mockedModule, '__esModule', { value: true });
        const mocks = allowedMocks[componentPath];

        for (const mock of mocks) {
          const mockIdentifiers = mock.identifier.split('.');
          if (mock.type === 'namespace') mockIdentifiers.shift();

          if (!mockIdentifiers.length && mock.type === 'namespace') {
            delete mockedModule['__esModule'];
            mockedModule = AutoMockComponent;
            break;
          }

          if (mock.type === 'default') {
            mockedModule['default'] = AutoMockComponent;
          } else {
            const mostRightIdentifier = mockIdentifiers.pop();
            if (!mostRightIdentifier) continue;
            if (mockIdentifiers.length) {
              let mockedPath = mockedModule;
              while (mockIdentifiers.length > 0) {
                const subLevel = mockIdentifiers.shift();
                mockedPath[subLevel] = { ...mockedModule[subLevel] };
                mockedPath = mockedPath[subLevel];
              }
              mockedPath[mostRightIdentifier] = AutoMockComponent;
            } else {
              mockedModule[mostRightIdentifier] = AutoMockComponent;
            }
          }
        }
        return mockedModule;
      });
    }
  } catch (err) {
    console.error(err);
  }
};

module.exports = (filePath, testPath, resolvers) => {
  if (!filePath || !testPath) {
    throw new Error(
      'Either babel plugin "jest-auto-mock-components" is not enabled or you passed non imported identifier to autoMockComponents()'
    );
  }

  let currentPath = '';
  try {
    currentPath = require.resolve(`${filePath}`, { paths: [path.dirname(testPath)] });
  } catch (_) {
    return;
  }

  const code = fs.readFileSync(currentPath, 'utf8');
  if (!code) return;

  const components = findComponentsForMock(code, resolvers);
  if (components.length) mockCompoennts(components, currentPath);
};
