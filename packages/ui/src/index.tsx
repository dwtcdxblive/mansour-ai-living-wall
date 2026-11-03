import type {ButtonHTMLAttributes, ReactNode} from 'react';
import React from 'react';
export function Button({children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{children:ReactNode}){return <button className={`mw-button ${className}`} {...props}>{children}</button>}
export function CharacterFallback({name,color='#e5483e'}:{name:string;color?:string}){return <div className="character-fallback" style={{background:`linear-gradient(145deg,${color},#102e3b)`}} aria-label={name}><span>{name.slice(0,1)}</span></div>}
