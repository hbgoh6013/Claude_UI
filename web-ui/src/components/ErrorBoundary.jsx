import { Component } from 'react'

/**
 * Error Boundary 컴포넌트
 * 탭 콘텐츠에서 발생하는 렌더링 오류를 포착하여
 * 전체 앱 크래시를 방지하고 사용자에게 오류 정보를 표시
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h3 className="error-boundary-title">Something went wrong</h3>
            <p className="error-boundary-message">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button className="error-boundary-btn" onClick={this.handleReset}>
              Try Again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
