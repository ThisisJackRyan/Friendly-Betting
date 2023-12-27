import React from 'react';
import css from './OverUnder.module.css';

const CreateOverUnder = () => {
  
    const handelSubmit = (e) => {   
        e.preventDefault();
        console.log('Creating over under bet');
    }

  return (
    <div className={css.OverUnder}>
       <form onSubmit={handelSubmit}>
            <div className={css.betContainer}>
                Proposition:
                <div className={css.bet}>
                    <textarea type="text"  />
                </div>
            </div>
            <div>
                <div className={css.setting}>
                    <span className={css.label}>Line:</span>
                    <input className={css.input} type="number" />
                </div>
            </div>
            <button type="submit">Create bet</button>
        </form>
    </div>
  );
};

export default CreateOverUnder;
