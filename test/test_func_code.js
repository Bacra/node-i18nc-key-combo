'use strict';

var expect		= require('expect.js');
var i18nc		= require('i18nc');
var keyCombo	= require('../');
keyCombo(i18nc);

describe('#keyCombo', function()
{
	function txt2code(val)
	{
		var info = i18nc(val,
			{
				codeModifiedArea: ['TranslateWord'],
				pluginEnabled:
				{
					keyCombo: true
				},
				pluginSettings:
				{
					keyComboMode: 'I18N'
				}
			});
		return info.code;
	}

	it('#base', function()
	{
		expect(txt2code('"中文"+"词典"')).to.be("I18N('中文词典')");
	});

	it('#I18N handler', function()
	{
		expect(txt2code('"中文"+11+I18N("词典")')).to.be("I18N('中文11词典')");
	});
});



module.exports = function code()

{
	var a = '123'+'中文'+I18N('abc');
	var b = '123>中文'+I18N('abc');
	var c = '<span>11</span>55'+'<span>11</span>'+222+'简体'+333+'2<span>22</span>';
	var d = '1'+'2';
}
