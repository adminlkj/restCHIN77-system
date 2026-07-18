import React from 'react';

// حدود خطأ حول معاينة الإيصال الحراري — تمنع انهيار التطبيق بالكامل إن رمى
// مكوّن الإيصال خطأً أثناء العرض، وتُظهر رسالة واضحة بدل الشاشة البيضاء.
export default class ReceiptErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unknown error' };
  }

  componentDidCatch(error, info) {
    console.error('Receipt render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center text-sm text-rose-700">
          {this.props.fallbackText || 'تعذّر عرض الإيصال'}
          <div className="mt-2 text-xs text-muted-foreground font-mono break-all">{this.state.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}