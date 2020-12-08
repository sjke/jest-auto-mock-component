const traverse = require('@babel/traverse').default;
const parser = require('@babel/parser');
const types = require('@babel/types');

const getMostLeftJSXIdentifier = (exp) => {
  if (types.isJSXIdentifier(exp.object)) return exp.object;
  return getMostLeftJSXIdentifier(exp.object);
};

const getMostLeftIdentifier = (exp) => {
  if (!types.isMemberExpression(exp)) return;
  if (types.isIdentifier(exp.object)) return exp.object;
  return getMostLeftIdentifier(exp.object);
};

const identifierByNode = (exp) => {
  if (types.isIdentifier(exp) || types.isJSXIdentifier(exp)) return exp.name;
  return identifierByNode(exp.object) + `.${exp.property.name}`;
};

const processHocLikeCallExpression = (exp, scope) => {
  if (!exp.arguments.length) return [undefined, undefined];

  const firstArg = exp.arguments.find((a) => types.isIdentifier(a) || types.isMemberExpression(a));
  if (!firstArg) return [undefined, undefined];

  const identifier = types.isIdentifier(firstArg) ? firstArg : getMostLeftIdentifier(firstArg);
  if (!identifier) [undefined, undefined];

  const binding = scope.getBinding(identifier.name);
  if (!binding) return [undefined, undefined];

  if (binding.kind === 'module') {
    return [firstArg, binding];
  } else {
    if (
      !binding.path.isVariableDeclarator() ||
      !(types.isTaggedTemplateExpression(binding.path.node.init) || types.isCallExpression(binding.path.node.init))
    )
      return [undefined, undefined];

    const init = binding.path.node.init;

    if (!init) return [undefined, undefined];
    if (types.isTaggedTemplateExpression(init) && !types.isCallExpression(init.tag)) return [undefined, undefined];

    let callExp = types.isCallExpression(init) ? init : init.tag;
    if (types.isCallExpression(callExp.callee)) callExp = callExp.callee;

    return processHocLikeCallExpression(callExp, binding.path.scope);
  }
};

const type = (binding) => {
  return binding.path.isImportDefaultSpecifier()
    ? 'default'
    : binding.path.isImportNamespaceSpecifier()
    ? 'namespace'
    : 'name';
};

const resolvePath = (binding, resolvers) => {
  const filePath = binding.path.parent.source.value;
  try {
    require.resolve(filePath);
    return filePath;
  } catch (_) {
    const path = require('path');
    const currentPath = path.dirname(require.main.filename);

    const paths = resolvers.root.map((key) => currentPath.split(key.replace('.', ''))[0] + '/' + key);
    const newFilePath = paths.find((relativePath) => {
      try {
        require.resolve(relativePath + '/' + filePath);
        return true;
      } catch (_) {
        return false;
      }
    });
    if (newFilePath) return newFilePath + '/' + filePath;
    return filePath;
  }
};

const visitor = {
  CallExpression(path, state) {
    const callee = path.node.callee;
    if (!types.isIdentifier(callee) || !types.isMemberExpression(callee)) return;

    let node, binding;
    if (types.isCallExpression(callee)) [node, binding] = processHocLikeCallExpression(callee, path.scope);
    if (!node) [node, binding] = processHocLikeCallExpression(path.node, path.scope);
    if (!node || !binding || binding.kind !== 'module') return;

    const identifier = identifierByNode(node);
    if (state.mocks.map(({ identifier }) => identifier).includes(identifier)) return;
    state.mocks.push({ identifier, type: type(binding), path: resolvePath(binding, state.resolvers) });
  },
  JSXOpeningElement(path, state) {
    let node, binding;

    if (types.isJSXMemberExpression(path.node.name)) {
      binding = path.scope.getBinding(getMostLeftJSXIdentifier(path.node.name).name);
      if (!binding || binding.kind !== 'module') return;
      node = path.node.name;
    } else if (types.isJSXIdentifier(path.node.name)) {
      binding = path.scope.getBinding(path.node.name.name);

      if (!binding) return;

      if (binding.kind === 'module') {
        node = path.node.name;
      } else {
        if (!binding.path.isVariableDeclarator()) return;

        const init = binding.path.node.init;

        if (init && (types.isIdentifier(init) || types.isMemberExpression(init))) {
          node = init;
          const leftIdentifier = getMostLeftIdentifier(node);

          if (leftIdentifier) {
            const newBinding = binding.path.scope.getBinding(leftIdentifier.name);
            if (newBinding && newBinding.kind === 'module') binding = newBinding;
          }
        } else if (init && (types.isTaggedTemplateExpression(init) || types.isCallExpression(init))) {
          if (types.isTaggedTemplateExpression(init) && !types.isCallExpression(init.tag)) return;

          let callExp = types.isTaggedTemplateExpression(init) ? init.tag : init;
          if (types.isCallExpression(callExp.callee)) {
            [node, binding] = processHocLikeCallExpression(callExp.callee, binding.path.scope);
          }

          if (!node && !types.isCallExpression(callExp.callee)) {
            [node, binding] = processHocLikeCallExpression(callExp, binding.path.scope);
          }
        }
      }
    }

    if (!node || !binding || binding.kind !== 'module') return;

    const identifier = identifierByNode(node);
    if (state.mocks.map(({ identifier }) => identifier).includes(identifier)) return;
    state.mocks.push({ identifier, type: type(binding), path: resolvePath(binding, state.resolvers) });
  }
};

module.exports = (code, resolvers) => {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: [
      'jsx',
      'asyncGenerators',
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      ['decorators', { decoratorsBeforeExport: true }],
      'doExpressions',
      'dynamicImport',
      'functionBind',
      'functionSent',
      'objectRestSpread',
      'bigInt',
      'exportDefaultFrom',
      'exportNamespaceFrom',
      'importMeta',
      'optionalCatchBinding',
      'optionalChaining',
      'nullishCoalescingOperator'
    ]
  });
  if (!ast) return [];

  try {
    const state = { mocks: [], resolvers };
    traverse(ast, visitor, undefined, state);
    return state.mocks;
  } catch (_) {
    return [];
  }
};
