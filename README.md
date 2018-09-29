I18NC-KEY-COMBO
================


[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Coveralls][coveralls-image]][coveralls-url]
[![NPM License][license-image]][npm-url]

# Install

```
npm install i18nc i18nc-key-combo --save
```

# Useage

```javascript
var i18nc = require('i18nc');
require('i18nc-key-combo')(i18nc);

var info = i18nc('"中文"+11+I18N("词典")',
{
  pluginEnabled: {keyCombo: true},
  pluginSettings: {keyComboMode: 'I18N'}
});

console.log(info.code);  // I18N('中文11词典')
```


[npm-image]: http://img.shields.io/npm/v/i18nc-key-combo.svg
[downloads-image]: http://img.shields.io/npm/dm/i18nc-key-combo.svg
[npm-url]: https://www.npmjs.org/package/i18nc-key-combo
[travis-image]: http://img.shields.io/travis/Bacra/node-i18nc-key-combo/master.svg?label=linux
[travis-url]: https://travis-ci.org/Bacra/node-i18nc-key-combo
[coveralls-image]: https://img.shields.io/coveralls/Bacra/node-i18nc-key-combo.svg
[coveralls-url]: https://coveralls.io/github/Bacra/node-i18nc-key-combo
[license-image]: http://img.shields.io/npm/l/i18nc-key-combo.svg
