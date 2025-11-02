class SvgUnicodeHelper {


  static createUnicodeCharge(n: number): string {
    if (n === 1) {
      return '⁺';
    }

    if (n === -1) {
      return '⁻';
    }

    if (n > 1) {
      return SvgUnicodeHelper.createUnicodeSuperscript(n) + '⁺';
    }

    if (n < -1) {
      return SvgUnicodeHelper.createUnicodeSuperscript(n) + '⁻';
    }

    return ''
  }



  static createUnicodeSubscript(n: number): string {
    let result = '';

    n.toString().split('').forEach(d => {
      result += ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'][parseInt(d)];
    });

    return result
  }



  static createUnicodeSuperscript(n: number): string {
    let result = '';

    n.toString().split('').forEach(d => {
      let parsed = parseInt(d);
      if (Number.isFinite(parsed)) {
        result += ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'][parsed];
      }
    });

    return result
  }



  static replaceNumbersWithSubscript(text: string): string {
    let subscriptNumbers = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
      '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
    };

    for (const [key, value] of Object.entries(subscriptNumbers)) {
      text = text.replaceAll(key, value);
    }

    return text;
  }
}

export = SvgUnicodeHelper;
