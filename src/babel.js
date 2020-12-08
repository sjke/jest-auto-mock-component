const nodeIdentifier = (types, exp) => {
  if (!types.isMemberExpression(exp)) return;
  if (types.isIdentifier(exp.object)) return exp.object;
  return nodeIdentifier(types, exp.object);
};

module.exports = ({ types: types, template: tmpl }, options = {}) => {
  return {
    pre() {
      this.mocked = [];
      this.withAutoMock = false;
    },

    visitor: {
      ImportDeclaration(path) {
        // Remove import to replace with babel transform params
        if (path.node.source.value === 'jest-auto-mock-components') path.remove();
      },
      CallExpression(path, state) {
        if (types.isIdentifier(path.node.callee) && path.node.callee.name === 'autoMockComponents') {
          this.withAutoMock = true;

          if (!path.parentPath.isExpressionStatement() || !path.scope.path.isProgram()) return;

          const node = path.node.arguments[0];

          if (!types.isIdentifier(node) && !types.isMemberExpression(node)) {
            throw new Error(`Invalid argument passed to autoMockComponents`);
          }

          const identifier = types.isMemberExpression(node) ? nodeIdentifier(node) : node;

          if (!identifier) return;

          const identifierName = identifier.name;
          const binding = path.scope.getBinding(identifierName);

          if (!binding || binding.kind !== 'module') return;

          const modulePath = binding.path.parent.source.value;

          if (this.mocked.includes(modulePath)) {
            path.parentPath.remove();
            return;
          }

          let resolvers = {};
          const moduleResolver = state.file.opts.plugins.find(({ key }) => key == 'module-resolver');
          if (moduleResolver && moduleResolver.options) resolvers = moduleResolver.options;

          path.parentPath.replaceWith(
            tmpl(
              `
              (function() {
                  const autoMockComponents = jest.requireActual("jest-auto-mock-components");
                  autoMockComponents(FILE_PATH, STATE_PATH, RESOLVERS);
              })();
              `,
              {
                placeholderPattern: false,
                placeholderWhitelist: new Set(['FILE_PATH', 'STATE_PATH', 'RESOLVERS'])
              }
            )({
              FILE_PATH: types.stringLiteral(modulePath),
              STATE_PATH: types.stringLiteral(state.filename || ''),
              RESOLVERS: types.objectExpression([
                types.ObjectProperty(
                  types.identifier('root'),
                  types.arrayExpression([resolvers.root].flat().map((path) => types.stringLiteral(path)))
                ),
                types.ObjectProperty(
                  types.identifier('alias'),
                  types.objectExpression(
                    Object.keys(options.alias || {}).map((key) =>
                      types.ObjectProperty(types.identifier(key), types.stringLiteral(options.alias[key]))
                    )
                  )
                )
              ])
            })
          );

          this.mocked.push(modulePath);
          path.parentPath.node._blockHoist = 4;
        }
      }
    }
  };
};
