import React, { useState, useRef, useEffect, useCallback, ReactNode, memo } from 'react';

interface LazyLoadProps {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  threshold?: number;
  className?: string;
  height?: string | number;
}

export const LazyLoad = memo(
  ({
    children,
    fallback = <div className="animate-pulse bg-gray-200 h-48 rounded-lg"></div>,
    rootMargin = '50px',
    threshold = 0.1,
    className = '',
    height = 'auto',
  }: LazyLoadProps) => {
    const [isVisible, setIsVisible] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const elementRef = useRef<HTMLDivElement>(null);

    const observerCallback = useCallback(
      (entries: IntersectionObserverEntry[]) => {
        const [entry] = entries;
        if (entry.isIntersecting && !hasLoaded) {
          setIsVisible(true);
          setHasLoaded(true);
        }
      },
      [hasLoaded]
    );

    useEffect(() => {
      const element = elementRef.current;
      if (!element) return;

      const observer = new IntersectionObserver(observerCallback, {
        rootMargin,
        threshold,
      });

      observer.observe(element);

      return () => {
        observer.unobserve(element);
        observer.disconnect();
      };
    }, [observerCallback, rootMargin, threshold]);

    return (
      <div
        ref={elementRef}
        className={className}
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      >
        {isVisible ? children : fallback}
      </div>
    );
  }
);

LazyLoad.displayName = 'LazyLoad';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export const LazyImage = memo(
  ({
    src,
    alt,
    className = '',
    placeholder = '/placeholder-image.jpg',
    onLoad,
    onError,
  }: LazyImageProps) => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    const observerCallback = useCallback(
      (entries: IntersectionObserverEntry[]) => {
        const [entry] = entries;
        if (entry.isIntersecting && imageSrc === null) {
          setImageSrc(src);
        }
      },
      [src, imageSrc]
    );

    useEffect(() => {
      const element = imgRef.current;
      if (!element) return;

      const observer = new IntersectionObserver(observerCallback, {
        rootMargin: '50px',
        threshold: 0.1,
      });

      observer.observe(element);

      return () => {
        observer.unobserve(element);
        observer.disconnect();
      };
    }, [observerCallback]);

    const handleLoad = useCallback(() => {
      setIsLoading(false);
      onLoad?.();
    }, [onLoad]);

    const handleError = useCallback(() => {
      setIsLoading(false);
      setHasError(true);
      onError?.();
    }, [onError]);

    if (hasError) {
      return (
        <div className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}>
          <span className="text-sm">Gagal memuat gambar</span>
        </div>
      );
    }

    return (
      <div className={`relative ${className}`}>
        {isLoading && <div className="absolute inset-0 animate-pulse bg-gray-200 rounded-lg"></div>}
        <img
          ref={imgRef}
          src={imageSrc || placeholder}
          alt={alt}
          className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    );
  }
);

LazyImage.displayName = 'LazyImage';

interface LazyComponentProps {
  component: React.ComponentType<any>;
  componentProps?: Record<string, any>;
  fallback?: ReactNode;
  rootMargin?: string;
  threshold?: number;
}

export const LazyComponent = memo(
  ({
    component: Component,
    componentProps = {},
    fallback = <div className="animate-pulse bg-gray-200 h-48 rounded-lg"></div>,
    rootMargin = '50px',
    threshold = 0.1,
  }: LazyComponentProps) => {
    const [isVisible, setIsVisible] = useState(false);
    const elementRef = useRef<HTMLDivElement>(null);

    const observerCallback = useCallback((entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting) {
        setIsVisible(true);
      }
    }, []);

    useEffect(() => {
      const element = elementRef.current;
      if (!element) return;

      const observer = new IntersectionObserver(observerCallback, {
        rootMargin,
        threshold,
      });

      observer.observe(element);

      return () => {
        observer.unobserve(element);
        observer.disconnect();
      };
    }, [observerCallback, rootMargin, threshold]);

    return <div ref={elementRef}>{isVisible ? <Component {...componentProps} /> : fallback}</div>;
  }
);

LazyComponent.displayName = 'LazyComponent';
