import { PageTitleRow } from '../../components/page-title.jsx';
import React, { useId, useState } from 'react';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { Field, Notice } from '../../components/forms/fields.jsx';
import { Skeleton } from '../../components/skeleton.jsx';
import { useResource } from '../../data/use-resource.js';
import { useSave } from '../../data/use-save.js';

/** Initial grouping delays outbound alerts, never monitor checks or incident creation. */
export function AlertGroupingSettings() {
  const formId = useId();
  const resource = useResource('/settings/workspace');
  const [seconds, setSeconds] = useState(null),
    [saved, setSaved] = useState(false);
  const save = useSave();
  return (
    <section className="panel space-y-4 p-6">
      <PageTitleRow
        title="Alert Grouping"
        actions={
          <button
            type="submit"
            form={formId}
            className="btn-primary"
            disabled={save.busy || !resource.data}
          >
            Save
          </button>
        }
      />
      <p>
        Collect related failing monitor checks for the same service before sending its initial
        notification. Incidents appear immediately. Use 0 to send immediately; manual incidents are
        unaffected.
      </p>
      <Notice error={resource.error || save.error} />
      {resource.data ? (
        <ValidatedForm
          id={formId}
          noValidate
          className="space-y-4"
          onSubmit={(event, report) => {
            event.preventDefault();
            const value = seconds ?? resource.data.settings.alertGroupingSeconds;
            if (!Number.isInteger(value) || value < 0 || value > 300) {
              report({ alertGroupingSeconds: 'Enter a whole number from 0 to 300 seconds.' });
              return;
            }
            save.run(
              '/settings/workspace',
              'PUT',
              {
                revision: resource.data.revision,
                settings: {
                  ...resource.data.settings,
                  alertGroupingSeconds: seconds ?? resource.data.settings.alertGroupingSeconds,
                },
              },
              () => {
                setSeconds(null);
                setSaved(true);
              },
            );
          }}
        >
          <Field
            name="alertGroupingSeconds"
            label="Alert grouping window (seconds)"
            errors={save.fields}
            helpText="0–300 seconds. Default: 30 seconds. Applies to new automatic incidents."
          >
            <input
              name="alertGroupingSeconds"
              required
              type="number"
              min={0}
              max={300}
              step={1}
              value={seconds ?? resource.data.settings.alertGroupingSeconds}
              onChange={(event) => {
                setSeconds(event.target.value === '' ? '' : Number(event.target.value));
                setSaved(false);
              }}
            />
          </Field>
          {saved && <p role="status">Alert grouping saved.</p>}
        </ValidatedForm>
      ) : (
        !resource.error && <Skeleton className="h-24 w-full" />
      )}
    </section>
  );
}
