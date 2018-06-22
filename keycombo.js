/**
 * keycombo 已经偏离正道
 * 这个输出的结果，是假的ast结构体
 */
'use strict';

var _			= require('lodash');
var debug		= require('debug')('i18nc-key-combo');
var astTpl		= require('i18nc-core/lib/ast_tpl');
var astUtils	= require('i18nc-core/lib/ast_utils');
var ArrayPush	= Array.prototype.push;


exports = module.exports = function(i18nc)
{
	i18nc.registerPlugin('keyCombo', function(i18nc, settings, enabled)
	{
		debug('register keycombo for i18nc');
		i18nc.addListener('beforeScan', function(emitData)
		{
			if (emitData.options.pluginEnabled.keyCombo)
			{
				if (emitData.result.type == 'BinaryExpression')
				{
					var newAst = combo(emitData.result, emitData.options);
					if (newAst) emitData.result = newAst;
				}
			}
			else
			{
				debug('keycombo is not enabled');
			}
		});

		i18nc.addListener('assignLineStrings', function(emitData)
		{
			if (!emitData.options.pluginEnabled.keyCombo
				|| !emitData.result || !emitData.result.length)
			{
				return;
			}

			var result = [];
			emitData.result.forEach(function(item)
			{
				var comboAsts = item.ast.__i18n_combo_asts__;
				if (!comboAsts)
				{
					result.push(item);
				}
				else
				{
					var ret = revert(item.lineStrings, comboAsts, emitData.options);
					if (ret)
						ArrayPush.apply(result, ret);
					else
						result.push(item);
				}
			});

			debug('assignLineStrings, new:%o, old:%o', result, emitData.result);

			emitData.result = result;
		});

		settings.keyComboMode = 'LITERAL';
		enabled.keyCombo = false;
	});
};

var exportsTest = exports._test = {};
exports.revert = revert;
exports.combo = combo;


// 合并 + 号的字符
// 注意：只有发生改变的情况下，才返回数据
function combo(ast, options)
{
	var arr = _plusBinaryExpressionAst2arrWidthClear(ast, options);

	// 将数组表示，转换为ast返回
	// 同时要计算新的range
	var asts = _arr2newAsts(arr);
	var newAst = astUtils.asts2plusExpression(asts);
	newAst.__i18n_combo_key__ = true;
	newAst.range = ast.range;
	newAst.__i18n_flag__ = ast.__i18n_flag__;

	return newAst;
}


/**
 * lineStrings:
 * [{translateWord: true, value: "中文"}, {translateWord: false, value: "zw"}]
 *
 * comboAsts:
 * 之前合并ast的comboAsts
 *
 * 返回结构
 * [{ast, lineStrings: [{translateWord:true, value: "中文"}] ]
 *
 * lineStrings 和 comboAsts的区间关系如下：
 * 1:1
 * 1:n
 * n:1
 * n:n （有一个是交叉的）
 */
function revert(lineStrings, comboAsts, options)
{
	var result = [];

	// 先整理一个需要翻译的起始位置map表处理
	var translateWordStartMap = {};
	var allValue = '';
	var allValue2 = '';
	var strlen = 0;
	lineStrings.forEach(function(item)
	{
		var value = item.value;

		if (typeof value != 'string' && value !== undefined) value += '';
		if (!value)
		{
			debug('translateWord value is emtpy');
			return;
		}

		if (item.translateWord)
		{
			translateWordStartMap[strlen] =
			{
				value	: value,
				start	: strlen,
				end		: strlen + value.length
			};
		}

		strlen += value.length;
		allValue += value;
	});


	// 对ast进行一个字符一个字符的判断
	var strOffset = 0;
	var translateWordItem = null;
	var collectorOne = new _RevertCollector(options);
	comboAsts.forEach(function(ast)
	{
		var astValue = ast.type == 'CallExpression'
				? _getArgs0IfI18NLiteral(ast, options)
				: ast.value;

		if (typeof astValue != 'string' && astValue !== undefined) astValue += '';
		if (!astValue)
		{
			debug('ast value is emtpy');
			return;
		}

		allValue2 += astValue;

		// endOffset 是下一个ast的开始
		// 当前ast不包含此偏移值
		var endOffset = strOffset+astValue.length;
		debug('ast value info:%s, endOffset:%d', astValue, endOffset);

		var isJoin = false;
		do
		{
			if (translateWordItem && strOffset >= translateWordItem.end)
			{
				translateWordItem = null;
			}

			if (!translateWordItem)
			{
				translateWordItem = translateWordStartMap[strOffset];
				if (translateWordItem)
				{
					collectorOne.addTranslateWordItem(translateWordItem);
					debug('finded translateWordItem, offset:%d, endOffset:%d', strOffset, translateWordItem.end);
				}
			}

			// 初始化的offset 可能还在上一个translateWordItem范围内
			if (translateWordItem)
			{
				if (!isJoin)
				{
					isJoin = true;
					collectorOne.addAst(ast, endOffset-astValue.length);
				}
			}
			// 如果没有翻译的word，自身也没有加入过
			// 但却有采集到数据
			// 说明采集到的数据，是之前一个完整闭环的数据
			else if (!isJoin && collectorOne.asts.length)
			{
				_restartCollect();
			}
		}
		while(++strOffset < endOffset);

		// ast 结束的时候，判断一下translateWordItem是否也正好结束
		// 如果两个都结束，就要回收数据到result
		if (translateWordItem && strOffset >= translateWordItem.end)
		{
			_restartCollect();
		}
	});


	function _restartCollect()
	{
		debug('run _restartCollect');
		var newValue = collectorOne.value();
		var newLiteralAst = astTpl.Literal(newValue);

		newLiteralAst.range =
			[
				collectorOne.asts[0].range[0],
				collectorOne.asts[collectorOne.asts.length-1].range[1]
			];

		result.push(
			{
				ast			: newLiteralAst,
				lineStrings	: collectorOne.lineStrings(),
			});

		translateWordItem = null;
		collectorOne = new _RevertCollector(options);
	}

	if (collectorOne.asts.length)
	{
		_restartCollect();
	}


	// 如果两个字符串不一致，就不替换了，避免出现range问题
	if (allValue != allValue2)
	{
		debug('Combo and translates value is not eql');
		return;
	}


	return result;
}


function _RevertCollector(options)
{
	this.firstAstStart = 0;
	this.options = options;
	this.asts = [];
	this.translateWordItems = [];
}

_.extend(_RevertCollector.prototype,
{
	addTranslateWordItem: function(item)
	{
		this.translateWordItems.push(item);
	},
	addAst: function(item, astStart)
	{
		if (!this.asts.length)
		{
			this.firstAstStart = astStart;
		}
		this.asts.push(item);
	},
	value: function()
	{
		var options = this.options;

		return this.asts.map(function(item)
			{
				return item.type == 'CallExpression'
					? _getArgs0IfI18NLiteral(item, options)
					: item.value;
			})
			.join('');
	},
	lineStrings: function()
	{
		var tmpValue = this.value();
		var offset = this.firstAstStart;
		var result = [];

		this.translateWordItems.forEach(function(item)
		{
			var preLen = item.start - offset;

			if (preLen)
			{
				result.push(
				{
					translateWord: false,
					value: tmpValue.slice(0, preLen)
				});
			}

			result.push(
			{
				translateWord: true,
				value: item.value
			});

			tmpValue = tmpValue.slice(item.end - offset);
			offset = item.end;
		});

		if (tmpValue)
		{
			result.push(
			{
				translateWord: false,
				value: tmpValue
			});
		}

		return result;
	},
});


/**
 * 将_plusBinaryExpressionAst2arrWidthClear结果，转换成纯ast的数组
 * 过程中会重新生成合并的combo的ast，计算range
 */
function _arr2newAsts(mainArr)
{
	return mainArr.map(function(item)
		{
			if (Array.isArray(item))
			{
				return _arr2newAsts(item);
			}

			if (item.comboAsts)
			{
				var ast = astTpl.Literal(item.value);
				ast.__i18n_combo_key__ = true;

				var comboAsts = item.comboAsts = item.comboAsts.sort(function(a, b)
					{
						return a.range[0] > b.range[0] ? 1 : -1;
					});

				ast.range =
					[
						comboAsts[0].range[0],
						comboAsts[comboAsts.length-1].range[1]
					];

				// 保存起来，后面拆分的时候，还可以用
				ast.__i18n_combo_asts__ = comboAsts;

				return ast;
			}

			return item.ast;
		});
}


/**
 * 同_plusBinaryExpressionAst2arr，只是增加对可合并数据的合并
 */
exportsTest._plusBinaryExpressionAst2arrWidthClear = _plusBinaryExpressionAst2arrWidthClear;
function _plusBinaryExpressionAst2arrWidthClear(ast, options)
{
	var arr = _plusBinaryExpressionAst2arr(ast, options);
	debug('plusBinaryExpressionAst2arr: %o', arr);

	return _comboLiteralText(arr);
}

/**
 * 合并_plusBinaryExpressionAst2arr结果
 * 输出的结构体，存在item.ast item.comboAsts两种情况
 */
function _comboLiteralText(mainArr)
{
	var result = [];
	var comboArr = [];
	var firstNumberItem;
	var isStringStart = false;

	function _end()
	{
		if (firstNumberItem)
		{
			if (isStringStart)
			{
				comboArr.push(firstNumberItem);
			}
			else
			{
				result.push(firstNumberItem);
			}

			firstNumberItem = null;
		}

		if (comboArr.length)
		{
			if (comboArr.length == 1)
			{
				result.push(comboArr[0]);
			}
			else
			{
				var comboAsts = [];
				var value = '';

				comboArr.forEach(function(item)
				{
					value += item.value;

					if (item.ast)
					{
						comboAsts.push(item.ast);
					}
					else if (item.comboAsts)
					{
						ArrayPush.apply(comboAsts, item.comboAsts);
					}
				});

				result.push(
					{
						type		: 'string',
						value		: value,
						comboAsts	: comboAsts
					});
			}

			comboArr = [];
		}
	}

	function _itemHandler(item, index)
	{
		switch(item.type)
		{
			case 'number':
				if (index === 0)
				{
					firstNumberItem = item;
				}
				else if (isStringStart)
				{
					comboArr.push(item);
				}
				else
				{
					if (firstNumberItem)
					{
						result.push(firstNumberItem);
						firstNumberItem = null;
					}
					result.push(item);
				}
				break;

			case 'string':
				isStringStart = true;

				if (firstNumberItem)
				{
					comboArr.push(firstNumberItem);
					firstNumberItem = null;
				}
				comboArr.push(item);
				break;

			default:
				_end();
				result.push(item);
		}
	}


	mainArr.forEach(function(item, index)
	{
		if (Array.isArray(item))
		{
			var subResult = _comboLiteralText(item);
			var isSubFistNumber = false;
			var isStopCombo = subResult.some(function(item, index)
				{
					switch(item.type)
					{
						case 'string':
							return false;

						case 'number':
							if (index === 0)
							{
								isSubFistNumber = true;
								return false;
							}
							else if (index === 1)
							{
								return isSubFistNumber;
							}
							else
							{
								return false;
							}
					}

					return true;
				});

			debug('stop combo:%d, subResult:%o', isStopCombo, subResult);

			if (isStopCombo)
			{
				_end();
				result.push(subResult);
			}
			else
			{
				subResult.forEach(_itemHandler);
			}
		}
		else
		{
			_itemHandler(item, index);
		}
	});

	_end();

	return result;
}


/**
 * 将+号预算转换成array数据结构
 * 原样转换，不会进行合并
 *
 * 如果ast出现（）运算，就用子数组表示
 *
 * 例如：
 * 1+2+3+(4+5) => [1,2,3,[4,5]]
 * 1+2+I18N(3) => [1,2,3]
 */
function _plusBinaryExpressionAst2arr(ast, options)
{
	if (ast.type != 'BinaryExpression' || ast.operator != '+')
	{
		return [{type: 'other', ast: ast}];
	}

	var result = [];
	var ret = _appendBinaryExpression(ast.left, options);
	ArrayPush.apply(result, ret);


	// 根据返回参数个数，如果多余一个
	// 那么表示有（）运算，需要独立出一个空间保存
	ret = _appendBinaryExpression(ast.right, options);
	if (ret.length == 1)
	{
		result.push(ret[0]);
	}
	else
	{
		result.push(ret);
	}

	return result;
}

function _appendBinaryExpression(ast, options)
{
	var result = [];
	switch(ast.type)
	{
		case 'Literal':
			result.push(
				{
					type: typeof ast.value,
					value: ast.value,
					ast: ast
				});
			break;

		case 'CallExpression':
			var arg0Value = _getArgs0IfI18NLiteral(ast, options);

			if (arg0Value
				&& options.pluginSettings
				&& options.pluginSettings.keyComboMode == 'I18N'
				&& ast.arguments.length == 1)
			{
				result.push(
					{
						type: 'string',
						value: arg0Value,
						ast: ast,
					});
			}
			else
			{
				debug('no ast info for call %s', ast.callee && ast.callee.name);
				result.push(
				{
					type: 'other',
					ast: ast
				});
			}
			break;

		case 'BinaryExpression':
			result = _plusBinaryExpressionAst2arr(ast, options);
			break;

		default:
			result.push(
			{
				type: 'other',
				ast: ast
			});
	}

	return result;
}


function _getArgs0IfI18NLiteral(ast, options)
{
	if (ast.type != 'CallExpression') return;
	var calleeName = ast.callee && ast.callee.name;
	if (calleeName == options.I18NHandlerName
		|| options.I18NHandlerAlias.indexOf(calleeName) != -1)
	{
		var arg0ast = ast.arguments && ast.arguments[0];
		return arg0ast && arg0ast.type == 'Literal' && arg0ast.value;
	}
}
