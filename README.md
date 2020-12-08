## Jest auto-mock components

Based on [jest-mock-external-components](https://github.com/asvetliakov/jest-mock-external-components)

## Installation and setup

`yarn add -D jest-auto-mock-components`
or
`npm install jest-auto-mock-components --save-dev`

Add to your `.babelrc` / `.babelrc.js` / `babel.config.js`

```
plugins: ["jest-auto-mock-components/babel",]
```

## Usage

```
import autoMockComponents from 'jest-auto-mock-components';

import YourComponent from './component';

autoMockComponents(YourComponent);
```
