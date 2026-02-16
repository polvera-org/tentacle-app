'use client'

import { useMemo } from 'react'

interface FolderBreadcrumbsProps {
  currentFolderPath: string
  onNavigate: (folderPath: string) => void
}

interface BreadcrumbItem {
  label: string
  path: string
}

function buildBreadcrumbs(path: string): BreadcrumbItem[] {
  const segments = path.split('/').filter((segment) => segment.length > 0)
  const breadcrumbs: BreadcrumbItem[] = [{ label: 'All Documents', path: '' }]

  for (let index = 0; index < segments.length; index += 1) {
    breadcrumbs.push({
      label: segments[index],
      path: segments.slice(0, index + 1).join('/'),
    })
  }

  return breadcrumbs
}

export function FolderBreadcrumbs({ currentFolderPath, onNavigate }: FolderBreadcrumbsProps) {
  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(currentFolderPath),
    [currentFolderPath],
  )

  return (
    <nav aria-label="Folder breadcrumbs" className="overflow-x-auto pb-1">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1

          return (
            <li key={item.path || 'root'} className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onNavigate(item.path)}
                aria-current={isLast ? 'page' : undefined}
                className={`max-w-[12rem] truncate rounded-md px-2 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${
                  isLast
                    ? 'bg-gray-100 font-medium text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {item.label}
              </button>
              {!isLast ? <span className="text-gray-300">/</span> : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
